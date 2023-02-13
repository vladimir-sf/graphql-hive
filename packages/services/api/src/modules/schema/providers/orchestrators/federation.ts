import { parse } from 'graphql';
import { CONTEXT, Inject, Injectable, Scope } from 'graphql-modules';
import type { SchemaBuilderApi } from '@hive/schema';
import { createTRPCProxyClient, httpLink } from '@trpc/client';
import { fetch } from '@whatwg-node/fetch';
import { Orchestrator, Project, ProjectType, SchemaObject } from '../../../../shared/entities';
import { sentry } from '../../../../shared/sentry';
import { Logger } from '../../../shared/providers/logger';
import { SchemaBuildError } from './errors';
import type { SchemaServiceConfig } from './tokens';
import { SCHEMA_SERVICE_CONFIG } from './tokens';

type ExternalCompositionConfig = {
  endpoint: string;
  encryptedSecret: string;
} | null;

@Injectable({
  scope: Scope.Operation,
})
export class FederationOrchestrator implements Orchestrator {
  type = ProjectType.FEDERATION;
  private logger: Logger;
  private schemaService;

  constructor(
    logger: Logger,
    @Inject(SCHEMA_SERVICE_CONFIG) serviceConfig: SchemaServiceConfig,
    @Inject(CONTEXT) context: GraphQLModules.ModuleContext,
  ) {
    this.logger = logger.child({ service: 'FederationOrchestrator' });
    this.schemaService = createTRPCProxyClient<SchemaBuilderApi>({
      links: [
        httpLink({
          url: `${serviceConfig.endpoint}/trpc`,
          fetch,
          headers: {
            'x-request-id': context.requestId,
          },
        }),
      ],
    });
  }

  private createConfig(config: Project['externalComposition']): ExternalCompositionConfig {
    if (config && config.enabled) {
      if (!config.endpoint) {
        throw new Error('External composition error: endpoint is missing');
      }

      if (!config.encryptedSecret) {
        throw new Error('External composition error: encryptedSecret is missing');
      }

      return {
        endpoint: config.endpoint,
        encryptedSecret: config.encryptedSecret,
      };
    }

    return null;
  }

  @sentry('FederationOrchestrator.validate')
  async validate(schemas: SchemaObject[], external: Project['externalComposition']) {
    this.logger.debug('Validating Federated Schemas');

    const result = await this.schemaService.validate.mutate({
      type: 'federation',
      schemas: schemas.map(s => ({
        raw: s.raw,
        source: s.source,
      })),
      external: this.createConfig(external),
    });

    return result.errors;
  }

  @sentry('FederationOrchestrator.build')
  async build(
    schemas: SchemaObject[],
    external: Project['externalComposition'],
  ): Promise<SchemaObject> {
    this.logger.debug('Building Federated Schemas');

    try {
      const result = await this.schemaService.build.mutate({
        type: 'federation',
        schemas: schemas.map(s => ({
          raw: s.raw,
          source: s.source,
        })),
        external: this.createConfig(external),
      });

      return {
        document: parse(result.raw),
        raw: result.raw,
        source: result.source,
      };
    } catch (error) {
      throw new SchemaBuildError(error as Error);
    }
  }

  @sentry('FederationOrchestrator.supergraph')
  async supergraph(
    schemas: SchemaObject[],
    external: Project['externalComposition'],
  ): Promise<string | null> {
    this.logger.debug('Generating Federated Supergraph');

    const result = await this.schemaService.supergraph.mutate({
      type: 'federation',
      schemas: schemas.map(s => ({
        raw: s.raw,
        source: s.source,
        url: s.url || null,
      })),
      external: this.createConfig(external),
    });

    return result.supergraph;
  }
}
