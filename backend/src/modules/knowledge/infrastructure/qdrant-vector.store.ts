import { z } from "zod";
import { ApiError } from "../../../shared/http/api-error.js";
import type { VectorPoint, VectorStore } from "../knowledge.types.js";
const searchSchema=z.object({result:z.array(z.object({id:z.union([z.string(),z.number()]),score:z.number(),payload:z.record(z.string(),z.unknown())}))});
const payloadSchema=z.object({result:z.array(z.object({id:z.union([z.string(),z.number()]),payload:z.record(z.string(),z.unknown()).nullable().optional()}))});
export interface QdrantVectorStoreOptions { requestTimeoutMs:number; collectionCheckTimeoutMs:number; payloadBatchSize:number }
export class QdrantVectorStore implements VectorStore {
  constructor(
    private readonly baseUrl:string,
    private readonly collection:string,
    private readonly options:QdrantVectorStoreOptions,
  ){}
  private async call(path:string,init?:RequestInit,allowNotFound=false){let response:Response;try{response=await fetch(`${this.baseUrl}${path}`,{...init,headers:{"Content-Type":"application/json",...init?.headers},signal:AbortSignal.timeout(this.options.requestTimeoutMs)})}catch{throw new ApiError(503,"QDRANT_UNAVAILABLE","Qdrant is unavailable")}if(allowNotFound&&response.status===404)return {result:[]};if(!response.ok)throw new ApiError(503,"QDRANT_ERROR",`Qdrant returned ${response.status}`);return response.json().catch(()=>({}))}
  async ensureCollection(vectorSize:number){const response=await fetch(`${this.baseUrl}/collections/${this.collection}`,{signal:AbortSignal.timeout(this.options.collectionCheckTimeoutMs)}).catch(()=>null);if(response?.ok)return;await this.call(`/collections/${this.collection}`,{method:"PUT",body:JSON.stringify({vectors:{size:vectorSize,distance:"Cosine"}})})}
  async upsert(points:VectorPoint[]){await this.call(`/collections/${this.collection}/points?wait=true`,{method:"PUT",body:JSON.stringify({points})})}
  async getPayloads(ids:string[]){const rows:Array<{id:string;payload:Record<string,unknown>}>=[];for(let offset=0;offset<ids.length;offset+=this.options.payloadBatchSize){const data=payloadSchema.parse(await this.call(`/collections/${this.collection}/points`,{method:"POST",body:JSON.stringify({ids:ids.slice(offset,offset+this.options.payloadBatchSize),with_payload:true,with_vector:false})},true));for(const row of data.result)if(row.payload)rows.push({id:String(row.id),payload:row.payload})}return rows}
  async search(vector:number[],limit:number){const data=await this.call(`/collections/${this.collection}/points/search`,{method:"POST",body:JSON.stringify({vector,limit,with_payload:true})});return searchSchema.parse(data).result.map(x=>({...x,id:String(x.id)}))}
  async deleteByDocument(documentId:string){await this.call(`/collections/${this.collection}/points/delete?wait=true`,{method:"POST",body:JSON.stringify({filter:{must:[{key:"documentId",match:{value:documentId}}]}})})}
  async deleteByIds(ids:string[]){if(!ids.length)return;await this.call(`/collections/${this.collection}/points/delete?wait=true`,{method:"POST",body:JSON.stringify({points:ids})})}
}
