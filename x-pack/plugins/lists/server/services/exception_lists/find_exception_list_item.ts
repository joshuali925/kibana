/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { SavedObjectsClientContract } from 'kibana/server';

import {
  ExceptionListSoSchema,
  FoundExceptionListItemSchema,
  ListId,
} from '../../../common/schemas';
import { SavedObjectType } from '../../saved_objects';

import { getSavedObjectType, transformSavedObjectsToFounExceptionListItem } from './utils';
import { NamespaceType } from './types';
import { getExceptionList } from './get_exception_list';

interface FindExceptionListItemOptions {
  listId: ListId;
  namespaceType: NamespaceType;
  savedObjectsClient: SavedObjectsClientContract;
  filter: string | undefined;
  perPage: number | undefined;
  page: number | undefined;
  sortField: string | undefined;
  sortOrder: string | undefined;
}

export const findExceptionListItem = async ({
  listId,
  namespaceType,
  savedObjectsClient,
  filter,
  page,
  perPage,
  sortField,
  sortOrder,
}: FindExceptionListItemOptions): Promise<FoundExceptionListItemSchema | null> => {
  const savedObjectType = getSavedObjectType({ namespaceType });
  const exceptionList = await getExceptionList({
    id: undefined,
    listId,
    namespaceType,
    savedObjectsClient,
  });
  if (exceptionList == null) {
    return null;
  } else {
    const savedObjectsFindResponse = await savedObjectsClient.find<ExceptionListSoSchema>({
      filter: getExceptionListItemFilter({ filter, listId, savedObjectType }),
      page,
      perPage,
      sortField,
      sortOrder,
      type: savedObjectType,
    });
    return transformSavedObjectsToFounExceptionListItem({ savedObjectsFindResponse });
  }
};

export const getExceptionListItemFilter = ({
  filter,
  listId,
  savedObjectType,
}: {
  listId: ListId;
  filter: string | undefined;
  savedObjectType: SavedObjectType;
}): string => {
  if (filter == null) {
    return `${savedObjectType}.attributes.list_type: item AND ${savedObjectType}.attributes.list_id: ${listId}`;
  } else {
    return `${savedObjectType}.attributes.list_type: item AND ${savedObjectType}.attributes.list_id: ${listId} AND ${filter}`;
  }
};
