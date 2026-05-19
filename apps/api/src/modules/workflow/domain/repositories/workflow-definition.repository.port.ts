import { WorkflowDefinitionEntity } from '../entities/workflow-definition.entity';

export abstract class WorkflowDefinitionRepositoryPort {
  abstract findById(id: string): Promise<WorkflowDefinitionEntity | null>;
  /** Returns active definitions whose trigger.type === 'event' and trigger.eventType matches. */
  abstract findByTriggerEvent(eventType: string): Promise<WorkflowDefinitionEntity[]>;
  abstract save(definition: WorkflowDefinitionEntity): Promise<WorkflowDefinitionEntity>;
  abstract existsById(id: string): Promise<boolean>;
}
