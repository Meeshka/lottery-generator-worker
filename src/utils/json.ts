export async function readJsonBody<T>(request: Request): Promise<T> {
  return request.json<T>();
}