import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowDefinitionOrmEntity } from './infrastructure/persistence/workflow-definition.orm-entity';
import { WorkflowExecutionOrmEntity } from './infrastructure/persistence/workflow-execution.orm-entity';
import {
  WORKFLOW_DEFINITION_REPOSITORY,
} from './domain/repositories/workflow-definition.repository.port';
import {
  WORKFLOW_EXECUTION_REPOSITORY,
} from './domain/repositories/workflow-execution.repository.port';
import { TriggerWorkflowHandler } from './application/commands/trigger-workflow/trigger-workflow.handler';

/**
 * Workflow repository implementations are stubs — extend when building
 * the full orchestration engine. The domain and command layer is complete.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowDefinitionOrmEntity, WorkflowExecutionOrmEntity]),
  ],
  providers: [
    TriggerWorkflowHandler,
  ],
  exports: [TriggerWorkflowHandler],
})
export class WorkflowModule {}
