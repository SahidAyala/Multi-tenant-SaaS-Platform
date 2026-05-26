import { Entity, generateId } from '@atlas/shared-kernel';
import { ConflictException } from '@atlas/shared-kernel';

export type WorkflowExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowStepResult {
  readonly stepId: string;
  readonly stepName: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly output?: Record<string, unknown>;
  readonly errorMessage?: string;
}

export interface WorkflowExecutionProps {
  executionId: string;
  definitionId: string;
  tenantId: string;
  correlationId: string;
  triggeredBy: string;
  triggerType: 'manual' | 'event' | 'schedule';
  input: Record<string, unknown>;
  status: WorkflowExecutionStatus;
  stepResults: WorkflowStepResult[];
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  errorMessage?: string;
  createdAt?: Date;
}

export class WorkflowExecutionEntity extends Entity<string> {
  private readonly _definitionId: string;
  private readonly _tenantId: string;
  private readonly _correlationId: string;
  private readonly _triggeredBy: string;
  private readonly _triggerType: 'manual' | 'event' | 'schedule';
  private readonly _input: Record<string, unknown>;
  private _status: WorkflowExecutionStatus;
  private _stepResults: WorkflowStepResult[];
  private _startedAt?: Date;
  private _completedAt?: Date;
  private _durationMs?: number;
  private _errorMessage?: string;

  private constructor(props: WorkflowExecutionProps) {
    super({ id: props.executionId, createdAt: props.createdAt });
    this._definitionId = props.definitionId;
    this._tenantId = props.tenantId;
    this._correlationId = props.correlationId;
    this._triggeredBy = props.triggeredBy;
    this._triggerType = props.triggerType;
    this._input = Object.freeze({ ...props.input });
    this._status = props.status;
    this._stepResults = [...props.stepResults];
    this._startedAt = props.startedAt;
    this._completedAt = props.completedAt;
    this._durationMs = props.durationMs;
    this._errorMessage = props.errorMessage;
  }

  static create(params: Omit<WorkflowExecutionProps, 'executionId' | 'status' | 'stepResults'>): WorkflowExecutionEntity {
    return new WorkflowExecutionEntity({
      executionId: generateId(),
      status: 'pending',
      stepResults: [],
      ...params,
    });
  }

  static reconstitute(props: WorkflowExecutionProps): WorkflowExecutionEntity {
    return new WorkflowExecutionEntity(props);
  }

  start(): void {
    if (this._status !== 'pending') {
      throw new ConflictException(`Cannot start execution in status: ${this._status}`);
    }
    this._status = 'running';
    this._startedAt = new Date();
    this.touch();
  }

  complete(output?: Record<string, unknown>): void {
    this._status = 'completed';
    this._completedAt = new Date();
    if (this._startedAt) {
      this._durationMs = this._completedAt.getTime() - this._startedAt.getTime();
    }
    this.touch();
  }

  fail(errorMessage: string): void {
    this._status = 'failed';
    this._completedAt = new Date();
    this._errorMessage = errorMessage;
    this.touch();
  }

  cancel(reason?: string): void {
    if (this._status === 'completed' || this._status === 'failed' || this._status === 'cancelled') {
      throw new ConflictException(`Cannot cancel execution in terminal status: ${this._status}`);
    }
    this._status = 'cancelled';
    this._completedAt = new Date();
    if (this._startedAt) {
      this._durationMs = this._completedAt.getTime() - this._startedAt.getTime();
    }
    if (reason) {
      this._errorMessage = reason;
    }
    this.touch();
  }

  get executionId(): string { return this._id; }
  get definitionId(): string { return this._definitionId; }
  get tenantId(): string { return this._tenantId; }
  get correlationId(): string { return this._correlationId; }
  get triggeredBy(): string { return this._triggeredBy; }
  get triggerType(): 'manual' | 'event' | 'schedule' { return this._triggerType; }
  get input(): Readonly<Record<string, unknown>> { return this._input; }
  get status(): WorkflowExecutionStatus { return this._status; }
  get stepResults(): ReadonlyArray<WorkflowStepResult> { return [...this._stepResults]; }
  get startedAt(): Date | undefined { return this._startedAt; }
  get completedAt(): Date | undefined { return this._completedAt; }
  get durationMs(): number | undefined { return this._durationMs; }
  get errorMessage(): string | undefined { return this._errorMessage; }
}
