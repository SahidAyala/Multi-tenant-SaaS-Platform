export abstract class ValueObject<T extends object> {
  protected readonly props: Readonly<T>;

  constructor(props: T) {
    this.props = Object.freeze({ ...props });
  }

  equals(vo: ValueObject<T>): boolean {
    if (vo === null || vo === undefined) return false;
    if (vo.constructor.name !== this.constructor.name) return false;
    return JSON.stringify(this.props) === JSON.stringify(vo.props);
  }

  unpack(): Readonly<T> {
    return this.props;
  }
}
