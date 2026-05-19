import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const WORKFLOW_TRIGGERED = 'workflow.execution.triggered';

export interface WorkflowTriggeredPayload {
  readonly executionId: string;
  readonly definitionId: string;
  readonly definitionName: string;
  readonly triggeredBy: string;
  readonly triggerType: 'manual' | 'event' | 'schedule';
  readonly input: Record<string, unknown>;
}

export type WorkflowTriggeredEvent = EventEnvelope<WorkflowTriggeredPayload>;
