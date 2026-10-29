import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { KnowledgeDocument, KnowledgeRepository, KnowledgeStatus } from "../knowledge.types.js";
const include={chunks:{orderBy:{ordinal:"asc" as const}}};
const map=(row:any):KnowledgeDocument=>row;
export class PrismaKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly prisma:PrismaClient){}
  async list(skip:number,take:number){const[rows,total]=await this.prisma.$transaction([this.prisma.knowledgeDocument.findMany({include,orderBy:[{createdAt:"desc"},{id:"desc"}],skip,take}),this.prisma.knowledgeDocument.count()]);return{rows:rows.map(map),total}}
  async findByHash(contentHash:string){const row=await this.prisma.knowledgeDocument.findUnique({where:{contentHash},include});return row?map(row):null}
  async findById(id:string){const row=await this.prisma.knowledgeDocument.findUnique({where:{id},include});return row?map(row):null}
  async create(value:KnowledgeDocument){const{chunks,...document}=value;return map(await this.prisma.knowledgeDocument.create({data:{...document,chunks:{createMany:{data:chunks.map(({documentId:_documentId,...chunk})=>chunk)}}},include}))}
  async setStatus(id:string,status:KnowledgeStatus){try{return map(await this.prisma.knowledgeDocument.update({where:{id},data:{status},include}))}catch{return null}}
  async delete(id:string){return(await this.prisma.knowledgeDocument.deleteMany({where:{id}})).count===1}
}
