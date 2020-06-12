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

import {
  EuiButtonEmpty,
  EuiForm,
  EuiFormRow,
  EuiLink,
  EuiPopover,
  EuiPopoverTitle,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  PopoverAnchorPosition,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n/react';
import React, { useState } from 'react';
import { EuiRadioGroup } from '@elastic/eui';
import { useKibana } from '../../../../kibana_react/public';

interface Props {
  language: string;
  onSelectLanguage: (newLanguage: string) => void;
  anchorPosition?: PopoverAnchorPosition;
}

export function QueryLanguageSwitcher(props: Props) {
  const kibana = useKibana();
  const kueryQuerySyntaxDocs = kibana.services.docLinks!.links.query.kueryQuerySyntax;
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const luceneLabel = (
    <FormattedMessage id="data.query.queryBar.luceneLanguageName" defaultMessage="Lucene" />
  );
  const kqlLabel = (
    <FormattedMessage id="data.query.queryBar.kqlLanguageName" defaultMessage="KQL" />
  );
  const sqlLabel = (
    <FormattedMessage id="data.query.queryBar.sqlLanguageName" defaultMessage="SQL" />
  );
  const pplLabel = (
    <FormattedMessage id="data.query.queryBar.sqlLanguageName" defaultMessage="PPL" />
  );
  const kqlFullName = (
    <FormattedMessage
      id="data.query.queryBar.kqlFullLanguageName"
      defaultMessage="Kibana Query Language"
    />
  );

  const button = (
    <EuiButtonEmpty
      size="xs"
      onClick={() => setIsPopoverOpen(!isPopoverOpen)}
      className="euiFormControlLayout__append"
      data-test-subj={'switchQueryLanguageButton'}
    >
      {props.language === 'kuery' ? 'KQL' : props.language.toUpperCase()}
    </EuiButtonEmpty>
  );

  return (
    <EuiPopover
      id="queryLanguageSwitcherPopover"
      anchorClassName="euiFormControlLayout__append"
      ownFocus
      anchorPosition={props.anchorPosition || 'downRight'}
      button={button}
      isOpen={isPopoverOpen}
      closePopover={() => setIsPopoverOpen(false)}
      withTitle
    >
      <EuiPopoverTitle>
        <FormattedMessage
          id="data.query.queryBar.syntaxOptionsTitle"
          defaultMessage="Syntax options"
        />
      </EuiPopoverTitle>
      <div style={{ width: '350px' }}>
        <EuiText>
          <p>
            <FormattedMessage
              id="data.query.queryBar.syntaxOptionsDescription"
              defaultMessage="The {docsLink} (KQL) offers a simplified query
              syntax and support for scripted fields. KQL also provides autocomplete if you have
              a Basic license or above. If you turn off KQL, Kibana uses Lucene."
              values={{
                docsLink: (
                  <EuiLink href={kueryQuerySyntaxDocs} target="_blank">
                    {kqlFullName}
                  </EuiLink>
                ),
              }}
            />
          </p>
        </EuiText>

        <EuiSpacer size="m" />

        <EuiRadioGroup
          options={[
            {
              id: 'kuery',
              label: 'KQL',
            },
            {
              id: 'lucene',
              label: 'LUCENE',
            },
            {
              id: 'sql',
              label: 'SQL',
            },
            {
              id: 'ppl',
              label: 'PPL',
            },
          ]}
          idSelected={props.language}
          onChange={id => {
            props.onSelectLanguage(id);
          }}
          legend={{
            children: 'Select query language',
          }}
        />
        {/* <EuiForm>
          <EuiFormRow label={kqlFullName}>
            <EuiSwitch
              id="queryEnhancementOptIn"
              name="popswitch"
              label={
                props.language === 'kuery' ? (
                  <FormattedMessage id="data.query.queryBar.kqlOnLabel" defaultMessage="On" />
                ) : (
                  <FormattedMessage id="data.query.queryBar.kqlOffLabel" defaultMessage="Off" />
                )
              }
              checked={props.language === 'kuery'}
              onChange={() => {
                const newLanguage = props.language === 'lucene' ? 'kuery' : 'lucene';
                props.onSelectLanguage(newLanguage);
              }}
              data-test-subj="languageToggle"
            />
          </EuiFormRow>
        </EuiForm>
        <EuiForm>
          <EuiFormRow label={'SQL?'}>
            <EuiSwitch
              id="SQLqueryEnhancementOptIn"
              name="SQLpopswitch"
              label={
                props.language === 'sql' ? (
                  <FormattedMessage id="data.query.queryBar.kqlOnLabel" defaultMessage="On" />
                ) : (
                  <FormattedMessage id="data.query.queryBar.kqlOffLabel" defaultMessage="Off" />
                )
              }
              checked={props.language === 'sql'}
              onChange={() => {
                const newLanguage = props.language === 'sql' ? 'kuery' : 'sql';
                props.onSelectLanguage(newLanguage);
              }}
              data-test-subj="SQLlanguageToggle"
            />
          </EuiFormRow>
        </EuiForm> */}
      </div>
    </EuiPopover>
  );
}
