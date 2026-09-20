import {NextResponse} from "next/server";
const SOURCE="https://planningregister.cherwell.gov.uk/Document/Download?fileName=8445300.pdf&imageId=10&isPlan=False&module=PLA&planId=301813&recordNumber=54862";
export const dynamic="force-dynamic";
export async function GET(){const r=await fetch(SOURCE,{cache:"no-store"});if(!r.ok)return NextResponse.json({error:"Test 001 source unavailable",status:r.status},{status:502});const data=await r.arrayBuffer();return new NextResponse(data,{headers:{"Content-Type":"application/pdf","Content-Disposition":"inline; filename=HX-Test-001-DH415BB-3.pdf","Cache-Control":"public, max-age=3600"}})}
