import { Entity, generateId, ValidationException } from '@atlas/shared-kernel';
import { isEmpty } from '@atlas/shared-kernel';

export type WorkflowTriggerType = 'manual' | 'event' | 'schedule' | 'webhook';
export type WorkflowDefinitionStatus = 'draft' | 'active' | 'archived';

export interface WorkflowStep {
  readonly stepId: string;
  readonly name: string;
  readonly type: string;
  readonly config: Record<string, unknown>;
  readonly onSuccess?: string;
  readonly onFailure?: string;
}

export interface WorkflowTrigger {
  readonly type: WorkflowTriggerType;
  readonly eventType?: string;
  readonly schedule?: string;
  readonly webhookPath?: string;
}

export interface WorkflowDefinitionProps {
  definitionId: string;
  tenantId: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  version: number;
  status: WorkflowDefinitionStatus;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class WorkflowDefinitionEntity extends Entity<string> {
  private readonly _tenantId: string;
  private _name: string;
  private _description?: string;
  private _trigger: WorkflowTrigger;
  private _steps: WorkflowStep[];
  private _version: number;
  private _status: WorkflowDefinitionStatus;
  private readonly _createdBy: string;

  private constructor(props: WorkflowDefinitionProps) {
    super({ id: props.definitionId, createdAt: props.createdAt, updatedAt: props.updatedAt });
    this._tenantId = props.tenantId;
    this._name = props.name;
    this._description = props.description;
    this._trigger = props.trigger;
    this._steps = [...props.steps];
    this._version = props.version;
    this._status = props.status;
    this._createdBy = props.createdBy;
  }

  static create(params: Omit<WorkflowDefinitionProps, 'definitionId' | 'version' | 'status'>): WorkflowDefinitionEntity {
    if (isEmpty(params.steps)) {
      throw new ValidationException({ steps: ['Workflow must have at least one step'] });
    }
    return new WorkflowDefinitionEntity({
      definitionId: generateId(),
      version: 1,
      status: 'draft',
      ...params,
    });
  }

  static reconstitute(props: WorkflowDefinitionProps): WorkflowDefinitionEntity {
    return new WorkflowDefinitionEntity(props);
  }

  activate(): void {
    this._status = 'active';
    this.touch();
  }

  archive(): void {
    this._status = 'archived';
    this.touch();
  }

  get definitionId(): string { return this._id; }
  get tenantId(): string { return this._tenantId; }
  get name(): string { return this._name; }
  get description(): string | undefined { return this._description; }
  get trigger(): WorkflowTrigger { return this._trigger; }
  get steps(): ReadonlyArray<WorkflowStep> { return [...this._steps]; }
  get version(): number { return this._version; }
  get status(): WorkflowDefinitionStatus { return this._status; }
  get createdBy(): string { return this._createdBy; }
  get isActive(): boolean { return this._status === 'active'; }
}
