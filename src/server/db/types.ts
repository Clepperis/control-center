export interface Sql {
  query<T extends Record<string, unknown> = Record<string,unknown>>(sql:string,params?:unknown[]):Promise<{rows:T[]}>;
}
export interface Database extends Sql {
  transaction<T>(fn:(tx:Sql)=>Promise<T>):Promise<T>;
  close():Promise<void>;
}
