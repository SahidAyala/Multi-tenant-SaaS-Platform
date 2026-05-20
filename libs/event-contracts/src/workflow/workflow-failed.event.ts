import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const WORKFLOW_FAILED = 'workflow.execution.failed';

export interface WorkflowFailedPayload {
  readonly executionId: string;
  readonly definitionId: string;
  readonly definitionName: string;
  readonly failedStep?: string;
  readonly errorMessage: string;
  readonly durationMs?: number;
}

export type WorkflowFailedEvent = EventEnvelope<WorkflowFailedPayload>;
