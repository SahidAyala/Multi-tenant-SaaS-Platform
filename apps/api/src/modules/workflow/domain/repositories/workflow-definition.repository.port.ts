import { WorkflowDefinitionEntity } from '../entities/workflow-definition.entity';

export const WORKFLOW_DEFINITION_REPOSITORY = Symbol('WORKFLOW_DEFINITION_REPOSITORY');

export interface WorkflowDefinitionRepositoryPort {
  findById(id: string, tenantId: string): Promise<WorkflowDefinitionEntity | null>;
  findByTriggerEvent(eventType: string, tenantId: string): Promise<WorkflowDefinitionEntity[]>;
  save(definition: WorkflowDefinitionEntity): Promise<WorkflowDefinitionEntity>;
  existsById(id: string, tenantId: string): Promise<boolean>;
}
