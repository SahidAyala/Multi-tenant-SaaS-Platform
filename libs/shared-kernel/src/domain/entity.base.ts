import { v4 as uuidv4 } from 'uuid';

export interface EntityProps<TId = string> {
  id: TId;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class Entity<TId = string> {
  protected readonly _id: TId;
  protected _createdAt: Date;
  protected _updatedAt: Date;

  constructor(props: { id?: TId; createdAt?: Date; updatedAt?: Date }) {
    this._id = (props.id ?? (uuidv4() as unknown as TId)) as TId;
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
  }

  get id(): TId {
    return this._id;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  protected touch(): void {
    this._updatedAt = new Date();
  }

  equals(other: Entity<TId>): boolean {
    if (!(other instanceof Entity)) return false;
    return this._id === other._id;
  }
}
