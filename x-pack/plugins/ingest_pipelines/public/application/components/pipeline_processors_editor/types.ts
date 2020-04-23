/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { ESCommonProcessorOptions } from '../../../../common/types';

export interface DraggableLocation {
  pathSelector: string;
  index: number;
}

export type ProcessorOptions<CustomProcessorOptions = {}> = ESCommonProcessorOptions &
  CustomProcessorOptions;

/** @private */
export interface ProcessorInternal<CustomProcessorOptions = {}> {
  readonly id: string;
  type: string;
  options: ProcessorOptions<CustomProcessorOptions>;
  onFailure?: ProcessorInternal[];
}
