import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';

export async function startMongo(): Promise<{
  container: StartedMongoDBContainer;
  uri: string;
}> {
  const container = await new MongoDBContainer('mongo:7').start();
  const uri = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/?directConnection=true`;
  return { container, uri };
}
