import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const WORKFLOW_COMPLETED = 'workflow.execution.completed';

export interface WorkflowCompletedPayload {
  readonly executionId: string;
  readonly definitionId: string;
  readonly status: 'completed' | 'failed' | 'cancelled';
  readonly durationMs: number;
  readonly output?: Record<string, unknown>;
  readonly errorMessage?: string;
}

export type WorkflowCompletedEvent = EventEnvelope<WorkflowCompletedPayload>;
