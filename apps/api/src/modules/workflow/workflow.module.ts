import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowDefinitionOrmEntity } from './infrastructure/persistence/workflow-definition.orm-entity';
import { WorkflowExecutionOrmEntity } from './infrastructure/persistence/workflow-execution.orm-entity';
import { WorkflowDefinitionRepository } from './infrastructure/persistence/workflow-definition.repository';
import { WorkflowExecutionRepository } from './infrastructure/persistence/workflow-execution.repository';
import { WorkflowDefinitionRepositoryPort } from './domain/repositories/workflow-definition.repository.port';
import { WorkflowExecutionRepositoryPort } from './domain/repositories/workflow-execution.repository.port';
import { TriggerWorkflowHandler } from './application/commands/trigger-workflow/trigger-workflow.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowDefinitionOrmEntity, WorkflowExecutionOrmEntity]),
  ],
  providers: [
    { provide: WorkflowDefinitionRepositoryPort, useClass: WorkflowDefinitionRepository },
    { provide: WorkflowExecutionRepositoryPort, useClass: WorkflowExecutionRepository },
    TriggerWorkflowHandler,
  ],
  exports: [TriggerWorkflowHandler],
})
export class WorkflowModule {}
