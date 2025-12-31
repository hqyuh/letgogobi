export abstract class IBase {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
}
