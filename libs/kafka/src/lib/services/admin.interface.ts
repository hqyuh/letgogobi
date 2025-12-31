import { IBase } from './base/base.interface';

export interface IKafkaAdmin extends IBase {
  getAllTopic(): Promise<string[]>;
  createTopics(): Promise<boolean>;
  deleteTopics(): Promise<boolean>;
}
