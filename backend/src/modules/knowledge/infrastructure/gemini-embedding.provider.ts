import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { ApiError } from "../../../shared/http/api-error.js";
import { appLogger } from "../../../shared/observability/agent-logger.js";
import type { EmbeddingProvider } from "../knowledge.types.js";
const responseSchema=z.object({embeddings:z.array(z.object({values:z.array(z.number()).min(1)}))});
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private readonly client:GoogleGenAI|null;
  constructor(apiKey:string|undefined,private readonly model:string){this.client=apiKey?new GoogleGenAI({apiKey}):null}
  async embed(texts:string[]){if(!this.client)throw new ApiError(503,"AI_NOT_CONFIGURED","Set GEMINI_API_KEY to index or search knowledge");const startedAt=Date.now();appLogger.info({event:"provider.request.started",provider:"gemini",operation:"embedding",model:this.model,inputCount:texts.length,inputChars:texts.reduce((total,text)=>total+text.length,0)});try{const response=await this.client.models.embedContent({model:this.model,contents:texts});const embeddings=responseSchema.parse(response).embeddings.map(x=>x.values);appLogger.info({event:"provider.request.completed",provider:"gemini",operation:"embedding",model:this.model,resultCount:embeddings.length,vectorSize:embeddings[0]?.length??0,durationMs:Date.now()-startedAt});return embeddings}catch(error){appLogger.warn({event:"provider.request.failed",provider:"gemini",operation:"embedding",model:this.model,errorName:error instanceof Error?error.name:"UNKNOWN_ERROR",durationMs:Date.now()-startedAt});if(error instanceof ApiError)throw error;throw new ApiError(503,"EMBEDDING_PROVIDER_UNAVAILABLE","Embedding provider is unavailable")}}
}
