/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { APICaller } from 'kibana/server';
import { datafeedsProvider } from './datafeeds';
import { jobsProvider } from './jobs';
import { groupsProvider } from './groups';
import { newJobCapsProvider } from './new_job_caps';
import { newJobChartsProvider, topCategoriesProvider } from './new_job';

export function jobServiceProvider(callAsCurrentUser: APICaller) {
  return {
    ...datafeedsProvider(callAsCurrentUser),
    ...jobsProvider(callAsCurrentUser),
    ...groupsProvider(callAsCurrentUser),
    ...newJobCapsProvider(callAsCurrentUser),
    ...newJobChartsProvider(callAsCurrentUser),
    ...topCategoriesProvider(callAsCurrentUser),
  };
}
