/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { get, trimEnd, debounce } from 'lodash';
import { BehaviorSubject, throwError, timer, defer, from, Observable, NEVER } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { CoreStart, CoreSetup, ToastsSetup } from 'kibana/public';
import moment from 'moment';
import {
  getCombinedSignal,
  AbortError,
  IKibanaSearchRequest,
  IKibanaSearchResponse,
  ISearchOptions,
  ES_SEARCH_STRATEGY,
  SearchRequest,
} from '../../common';
import { SearchUsageCollector } from './collectors';
import { SearchTimeoutError, PainlessError, isPainlessError, TimeoutErrorMode } from './errors';
import { toMountPoint } from '../../../kibana_react/public';

export interface SearchInterceptorDeps {
  http: CoreSetup['http'];
  uiSettings: CoreSetup['uiSettings'];
  startServices: Promise<[CoreStart, any, unknown]>;
  toasts: ToastsSetup;
  usageCollector?: SearchUsageCollector;
}

interface SearchParams {
  timeField: string;
  histogramInterval: string;
  dateHistogramAggsKey: string;
  timeFilter?: {
    gte: string;
    lte: string;
    format?: string;
  };
}

interface JdbcType {
  schema: Array<{ name: string; type: string }>;
  datarows: any[][];
  total: number;
  size: number;
  status: number;
}

export class SearchInterceptor {
  /**
   * `abortController` used to signal all searches to abort.
   *  @internal
   */
  protected abortController = new AbortController();

  /**
   * Observable that emits when the number of pending requests changes.
   * @internal
   */
  protected pendingCount$ = new BehaviorSubject(0);

  /**
   * @internal
   */
  protected application!: CoreStart['application'];

  /*
   * @internal
   */
  constructor(protected readonly deps: SearchInterceptorDeps) {
    this.deps.http.addLoadingCountSource(this.pendingCount$);

    this.deps.startServices.then(([coreStart]) => {
      this.application = coreStart.application;
    });
  }

  /*
   * @returns `TimeoutErrorMode` indicating what action should be taken in case of a request timeout based on license and permissions.
   * @internal
   */
  protected getTimeoutMode() {
    return TimeoutErrorMode.UPGRADE;
  }

  /*
   * @returns `Error` a search service specific error or the original error, if a specific error can't be recognized.
   * @internal
   */
  protected handleSearchError(
    e: any,
    request: IKibanaSearchRequest,
    timeoutSignal: AbortSignal,
    appAbortSignal?: AbortSignal
  ): Error {
    if (timeoutSignal.aborted || get(e, 'body.message') === 'Request timed out') {
      // Handle a client or a server side timeout
      const err = new SearchTimeoutError(e, this.getTimeoutMode());

      // Show the timeout error here, so that it's shown regardless of how an application chooses to handle errors.
      this.showTimeoutError(err);
      return err;
    } else if (appAbortSignal?.aborted) {
      // In the case an application initiated abort, throw the existing AbortError.
      return e;
    } else if (isPainlessError(e)) {
      return new PainlessError(e, request);
    } else {
      return e;
    }
  }

  /**
   * @internal
   */
  protected runSearch(
    request: IKibanaSearchRequest,
    signal: AbortSignal,
    strategy?: string
  ): Observable<IKibanaSearchResponse> {
    const { id, ...searchRequest } = request;

    const queryLanguage = (searchRequest as SearchRequest).query?.[0].language;
    if (queryLanguage === 'sql' || queryLanguage === 'ppl') {
      const aggs = searchRequest.params?.body?.aggs;
      const dateHistogramAggsKey =
        aggs && Object.keys(aggs).find((agg: any) => aggs[agg].date_histogram !== undefined);

      const dateHistogramDsl = dateHistogramAggsKey && aggs[dateHistogramAggsKey].date_histogram;

      const timeFilterRangeDsl = searchRequest.params?.body.query.bool.filter?.find(
        (filter: any) => filter.range !== undefined
      )?.range;
      const timeFilter =
        timeFilterRangeDsl && timeFilterRangeDsl[Object.keys(timeFilterRangeDsl)[0]];

      let searchParams: SearchParams = {
        dateHistogramAggsKey,
        timeField: timeFilterRangeDsl && Object.keys(timeFilterRangeDsl)[0],
        histogramInterval: dateHistogramDsl?.fixed_interval || dateHistogramDsl?.calendar_interval,
        timeFilter,
      };

      return queryLanguage === 'sql'
        ? this.runSQLSearch(searchRequest, searchParams)
        : this.runPPLSearch(searchRequest, searchParams);
    }

    const path = trimEnd(`/internal/search/${strategy || ES_SEARCH_STRATEGY}/${id || ''}`, '/');
    const body = JSON.stringify(searchRequest);
    return from(
      this.deps.http.fetch({
        method: 'POST',
        path,
        body,
        signal,
      })
    );
  }

  /**
   * @internal
   */
  private runSQLSearch(
    searchRequest: SearchRequest,
    searchParams: SearchParams
  ): Observable<IKibanaSearchResponse> {
    console.log('dateHistogramParams', searchParams);
    const query = searchRequest.query[0].query || `select * from ${searchRequest.params.index}`;
    const sqlDateFormat = 'YYYY-MM-DD HH:mm:ss.SSSSSS';
    const timeFilterQuery = searchParams.timeFilter
      ? `FILTER (WHERE ${searchParams.timeField} >= timestamp('${moment(
          searchParams.timeFilter.gte
        ).format(sqlDateFormat)}') and ${searchParams.timeField} <= timestamp('${moment(
          searchParams.timeFilter.lte
        ).format(sqlDateFormat)}'))`
      : '';

    const histogramDateFormat = this.getHistogramDateFormat(searchParams.histogramInterval);
    const filteredQuery = `from (${query}) as f ${timeFilterQuery}`;
    console.log('filteredQuery', filteredQuery);

    const dateHistogramQuery = `select DATE_FORMAT(${searchParams.timeField}, '${histogramDateFormat}'), count(1) ${timeFilterQuery} as filtered from ${searchRequest.params.index} group by DATE_FORMAT(${searchParams.timeField}, '${histogramDateFormat}')`;

    // const dateHistogramQuery = `select DATE_FORMAT(${searchParams.timeField}, '${histogramDateFormat}'), count(1) from kibana_sample_data_flights ${timeFilterQuery} group by DATE_FORMAT(timestamp, '${histogramDateFormat}')`;

    // const dateHistogramQuery = `select DATE_FORMAT(${searchParams.timeField}, '${dateFormat}'), count(1) from ${searchRequest.params.index} group by DATE_FORMAT(${searchParams.timeField}, '${dateFormat}')`;

    console.log('dateHistogramQuery', dateHistogramQuery);
    return from(
      this.querySQLPPL(dateHistogramQuery, 'sql').then((aggs: JdbcType) => {
        const histogram = this.aggsToDateHistogram(aggs);
        return this.querySQLPPL(query, 'sql')
          .then((jdbc) => this.jdbcToJson(jdbc))
          .then((json) => {
            return {
              rawResponse: {
                ...json,
                aggregations: {
                  [searchParams.dateHistogramAggsKey]: {
                    buckets: histogram,
                  },
                },
              },
            };
          });
      })
    );
  }

  /**
   * @internal
   */
  private runPPLSearch(
    searchRequest: SearchRequest,
    searchParams: SearchParams
  ): Observable<IKibanaSearchResponse> {
    let query = searchRequest.query[0].query || `source=${searchRequest.params.index}`;
    const sqlDateFormat = 'YYYY-MM-DD HH:mm:ss.SSSSSS';
    const timeFilterQuery = searchParams.timeFilter
      ? ` | WHERE ${searchParams.timeField} >= timestamp('${moment(
          searchParams.timeFilter.gte
        ).format(sqlDateFormat)}') and ${searchParams.timeField} <= timestamp('${moment(
          searchParams.timeFilter.lte
        ).format(sqlDateFormat)}')`
      : '';
    query = query + timeFilterQuery;

    if (!searchParams.dateHistogramAggsKey) {
      return from(
        this.querySQLPPL(query, 'ppl')
          .then((jdbc) => this.jdbcToJson(jdbc))
          .then((json) => ({ rawResponse: json }))
      );
    }

    const histogramDateFormat = this.getHistogramDateFormat(searchParams.histogramInterval);
    const dateHistogramQuery =
      query +
      timeFilterQuery +
      ` | eval span=DATE_FORMAT(${searchParams.timeField}, '${histogramDateFormat}') | stats count() by span`;

    console.log('dateHistogramQuery', dateHistogramQuery);
    console.log('query', query);

    return from(
      this.querySQLPPL(dateHistogramQuery, 'ppl').then((aggs: JdbcType) => {
        const histogram = this.aggsToDateHistogram(aggs, 1, 0);
        return this.querySQLPPL(query, 'ppl')
          .then((jdbc) => this.jdbcToJson(jdbc))
          .then((json) => {
            return {
              rawResponse: {
                ...json,
                aggregations: {
                  [searchParams.dateHistogramAggsKey]: {
                    buckets: histogram,
                  },
                },
              },
            };
          });
      })
    );
  }

  private querySQLPPL(query: string, language: string): Promise<JdbcType> {
    return this.deps.http
      .fetch({
        method: 'POST',
        path: `/api/sql_console/${language}query`,
        body: `{"query":"${query.replace(/"/g, '\\"')}"}`,
      })
      .then((response) => {
        console.log('explain response', response);
        return JSON.parse(response.data.resp);
      });
  }

  private getHistogramDateFormat(histogramInterval: string) {
    const unit = histogramInterval.match(/\D+/)![0] ?? null;
    if (!unit) return '';

    let dateFormat = '%Y';
    if (unit === 'y') return dateFormat;
    dateFormat += '-%m';
    if (unit === 'M') return dateFormat;
    dateFormat += '-%d';
    if (unit === 'd' || unit === 'w') return dateFormat;
    dateFormat += ' %H';
    if (unit === 'h') return dateFormat;
    dateFormat += ':%i';
    if (unit === 'm') return dateFormat;
    dateFormat += ':%s';
    if (unit === 's') return dateFormat;
    return dateFormat;
  }

  private aggsToDateHistogram(
    aggs: JdbcType,
    timeStringIndex: number = 0,
    docCountIndex: number = 1
  ): Array<{ key_as_string: string; key: number; doc_count: number }> {
    return aggs.datarows
      .filter((row: any[]) => row[docCountIndex] > 0)
      .map((row: any[]) => {
        const datetime = moment(row[timeStringIndex]);
        return {
          key_as_string: datetime.toISOString(),
          key: datetime.valueOf(),
          doc_count: row[docCountIndex],
        };
      });
  }

  /*
   * @returns discover compatible JSON response constructed from SQL/PPL JDBC response
   * @internal
   */
  private jdbcToJson(jdbc: JdbcType) {
    console.log('jdbc', jdbc);
    return {
      hits: {
        total: jdbc.total,
        hits: jdbc.datarows.map((row: any[], i: number) => ({
          _id: Math.random().toString(36).substring(2),
          _source: row.reduce((source: { [name: string]: any }, value: string, j: number) => {
            source[jdbc.schema[j].name] = value;
            return source;
          }, {}),
        })),
      },
    };
  }

  /**
   * @internal
   */
  protected setupAbortSignal({
    abortSignal,
    timeout,
  }: {
    abortSignal?: AbortSignal;
    timeout?: number;
  }) {
    // Schedule this request to automatically timeout after some interval
    const timeoutController = new AbortController();
    const { signal: timeoutSignal } = timeoutController;
    const timeout$ = timeout ? timer(timeout) : NEVER;
    const subscription = timeout$.subscribe(() => {
      timeoutController.abort();
    });

    // Get a combined `AbortSignal` that will be aborted whenever the first of the following occurs:
    // 1. The user manually aborts (via `cancelPending`)
    // 2. The request times out
    // 3. The passed-in signal aborts (e.g. when re-fetching, or whenever the app determines)
    const signals = [
      this.abortController.signal,
      timeoutSignal,
      ...(abortSignal ? [abortSignal] : []),
    ];

    const combinedSignal = getCombinedSignal(signals);
    const cleanup = () => {
      subscription.unsubscribe();
    };

    combinedSignal.addEventListener('abort', cleanup);

    return {
      combinedSignal,
      timeoutSignal,
      cleanup,
    };
  }

  /**
   * Right now we are throttling but we will hook this up with background sessions to show only one
   * error notification per session.
   * @internal
   */
  private showTimeoutError = debounce(
    (e: SearchTimeoutError) => {
      this.deps.toasts.addDanger({
        title: 'Timed out',
        text: toMountPoint(e.getErrorMessage(this.application)),
      });
    },
    30000,
    { leading: true, trailing: false }
  );

  /**
   * Searches using the given `search` method. Overrides the `AbortSignal` with one that will abort
   * either when `cancelPending` is called, when the request times out, or when the original
   * `AbortSignal` is aborted. Updates `pendingCount$` when the request is started/finalized.
   *
   * @param request
   * @options
   * @returns `Observalbe` emitting the search response or an error.
   */
  public search(
    request: IKibanaSearchRequest,
    options?: ISearchOptions
  ): Observable<IKibanaSearchResponse> {
    // Defer the following logic until `subscribe` is actually called
    return defer(() => {
      if (options?.abortSignal?.aborted) {
        return throwError(new AbortError());
      }

      const { timeoutSignal, combinedSignal, cleanup } = this.setupAbortSignal({
        abortSignal: options?.abortSignal,
      });
      this.pendingCount$.next(this.pendingCount$.getValue() + 1);

      return this.runSearch(request, combinedSignal, options?.strategy).pipe(
        catchError((e: any) => {
          return throwError(
            this.handleSearchError(e, request, timeoutSignal, options?.abortSignal)
          );
        }),
        finalize(() => {
          this.pendingCount$.next(this.pendingCount$.getValue() - 1);
          cleanup();
        })
      );
    });
  }

  /*
   *
   */
  public showError(e: Error) {
    if (e instanceof AbortError) return;

    if (e instanceof SearchTimeoutError) {
      // The SearchTimeoutError is shown by the interceptor in getSearchError (regardless of how the app chooses to handle errors)
      return;
    }

    if (e instanceof PainlessError) {
      this.deps.toasts.addDanger({
        title: 'Search Error',
        text: toMountPoint(e.getErrorMessage(this.application)),
      });
      return;
    }

    this.deps.toasts.addError(e, {
      title: 'Search Error',
    });
  }
}

export type ISearchInterceptor = PublicMethodsOf<SearchInterceptor>;
