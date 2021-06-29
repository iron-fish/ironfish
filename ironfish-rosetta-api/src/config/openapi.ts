/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Read the Open API definition directly from the Rosetta specs Github
import RosettaAPIDefinition from 'rosetta-specifications/api.json'

const searchBlockEndpointPath = {
  '/search/blocks': {
    post: {
      summary: '[INDEXER] Search for Blocks',
      description:
        '`/search/blocks` allows the caller to search for blocks that meet certain conditions. ',
      operationId: 'searchBlocks',
      tags: ['Search'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/SearchBlocksRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Expected response to a valid request',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SearchBlocksResponse',
              },
            },
          },
        },
        '500': {
          description: 'unexpected error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
            },
          },
        },
      },
    },
  },
}

const searchBlockEndpointComponents = {
  SearchBlocksRequest: {
    description: 'SearchBlocksRequest is used to search for blocks.\n',
    type: 'object',
    required: ['network_identifier'],
    properties: {
      network_identifier: {
        $ref: '#/components/schemas/NetworkIdentifier',
      },
      operator: {
        $ref: '#/components/schemas/Operator',
      },
      seek: {
        description: 'seek parameter to offset the pagination at a previous block height.',
        type: 'integer',
        format: 'int64',
        minimum: 0,
        example: 5,
      },
      limit: {
        description:
          'limit is the maximum number of blocks to return in one call. The implementation\nmay return <= limit blocks.\n',
        type: 'integer',
        format: 'int64',
        minimum: 0,
        maximum: 25,
        example: 5,
      },
      query: {
        description: 'query to filter blocks on hash or height\n',
        type: 'string',
      },
    },
  },
  SearchBlocksResponse: {
    description:
      'SearchBlocksResponse contains an ordered collection of Blocks\nthat match the query in SearchBlocksRequest. These Blocks\nare sorted from most recent block to oldest block.\n',
    type: 'object',
    required: ['blocks'],
    properties: {
      blocks: {
        type: 'array',
        description: 'blocks is an array of Block sorted by most recent BlockIdentifier.',
        items: {
          $ref: '#/components/schemas/Block',
        },
      },
      next_offset: {
        description:
          'next_offset is the next offset to use when paginating through\nblock results. If this field is not populated, there are\nno more blocks to query.\n',
        type: 'integer',
        format: 'int64',
        minimum: 0,
        example: 5,
      },
    },
  },
}

// Add new endpoints to the definition
export const OpenAPIDefinition = {
  ...RosettaAPIDefinition,
  paths: {
    ...RosettaAPIDefinition.paths,
    ...searchBlockEndpointPath,
  },
  components: {
    ...RosettaAPIDefinition.components,
    schemas: {
      ...RosettaAPIDefinition.components.schemas,
      ...searchBlockEndpointComponents,
    },
  },
}
