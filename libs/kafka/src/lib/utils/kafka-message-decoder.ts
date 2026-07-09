import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';

let registry: SchemaRegistry | null = null;

function schemaRegistry(): SchemaRegistry {
  if (!registry) {
    registry = new SchemaRegistry({
      host: 'http://localhost:8086/apis/ccompat/v7',
    });
  }

  return registry;
}

export async function decodeKafkaMessageValue<T>(
  value: Buffer | null,
): Promise<T | null> {
  if (!value || value.length === 0) {
    return null;
  }

  if (value[0] === 0x7b) {
    return JSON.parse(value.toString()) as T;
  }

  console.log(`chema_id: ${value.readInt32BE(1)}`);

  return (await schemaRegistry().decode(value)) as T;
}
