import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowDefinitionOrmEntity } from './infrastructure/persistence/workflow-definition.orm-entity';
import { WorkflowExecutionOrmEntity } from './infrastructure/persistence/workflow-execution.orm-entity';
import { WorkflowDefinitionRepository } from './infrastructure/persistence/workflow-definition.repository';
import { WorkflowExecutionRepository } from './infrastructure/persistence/workflow-execution.repository';
import { WorkflowDefinitionRepositoryPort } from './domain/repositories/workflow-definition.repository.port';
import { WorkflowExecutionRepositoryPort } from './domain/repositories/workflow-execution.repository.port';
import { TriggerWorkflowHandler } from './application/commands/trigger-workflow/trigger-workflow.handler';
import { CancelWorkflowExecutionHandler } from './application/commands/cancel-execution/cancel-execution.handler';
import { ListWorkflowExecutionsHandler } from './application/queries/list-executions/list-executions.handler';
import { GetWorkflowExecutionHandler } from './application/queries/get-execution/get-execution.handler';
import { WorkflowController } from './api/workflow.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowDefinitionOrmEntity, WorkflowExecutionOrmEntity]),
  ],
  controllers: [WorkflowController],
  providers: [
    { provide: WorkflowDefinitionRepositoryPort, useClass: WorkflowDefinitionRepository },
    { provide: WorkflowExecutionRepositoryPort, useClass: WorkflowExecutionRepository },
    TriggerWorkflowHandler,
    CancelWorkflowExecutionHandler,
    ListWorkflowExecutionsHandler,
    GetWorkflowExecutionHandler,
  ],
  exports: [TriggerWorkflowHandler],
})
export class WorkflowModule {}
