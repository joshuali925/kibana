/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */
import expect from '@kbn/expect';

import { FtrProviderContext } from '../../ftr_provider_context';

export function MachineLearningAnomalyExplorerProvider({ getService }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');

  return {
    async assertAnomalyExplorerEmptyListMessageExists() {
      await testSubjects.existOrFail('mlNoJobsFound');
    },

    async assertInfluencerListExists() {
      await testSubjects.existOrFail('mlAnomalyExplorerInfluencerList');
    },

    async assertInfluencerFieldExists(influencerField: string) {
      await testSubjects.existOrFail(`mlInfluencerFieldName ${influencerField}`);
    },

    async getInfluencerFieldLabels(influencerField: string): Promise<string[]> {
      const influencerFieldLabelElements = await testSubjects.findAll(
        `mlInfluencerEntry field-${influencerField} > mlInfluencerEntryFieldLabel`
      );
      const influencerFieldLabels = await Promise.all(
        influencerFieldLabelElements.map(async (elmnt) => await elmnt.getVisibleText())
      );
      return influencerFieldLabels;
    },

    async assertInfluencerListContainsLabel(influencerField: string, label: string) {
      const influencerFieldLabels = await this.getInfluencerFieldLabels(influencerField);
      expect(influencerFieldLabels).to.contain(
        label,
        `Expected influencer list for '${influencerField}' to contain label '${label}' (got '${influencerFieldLabels}')`
      );
    },

    async assertInfluencerFieldListLength(influencerField: string, expectedLength: number) {
      const influencerFieldLabels = await this.getInfluencerFieldLabels(influencerField);
      expect(influencerFieldLabels.length).to.eql(
        expectedLength,
        `Expected influencer list for '${influencerField}' to have length '${expectedLength}' (got '${influencerFieldLabels.length}')`
      );
    },

    async assertInfluencerFieldListNotEmpty(influencerField: string) {
      const influencerFieldEntries = await testSubjects.findAll(
        `mlInfluencerEntry field-${influencerField}`
      );
      expect(influencerFieldEntries.length).to.be.greaterThan(
        0,
        `Influencer list for field '${influencerField}' should have at least one entry (got 0)`
      );
    },

    async assertOverallSwimlaneExists() {
      await testSubjects.existOrFail('mlAnomalyExplorerSwimlaneOverall');
    },

    async assertSwimlaneViewByExists() {
      await testSubjects.existOrFail('mlAnomalyExplorerSwimlaneViewBy');
    },
  };
}
