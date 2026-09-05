import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth';
import { assertPanelLicensed } from '$lib/server/license';
import { getWorkspace, requireWorkspaceAccess } from '$lib/server/workspaces';
import { getKnowledgeArchitecture, saveKnowledgeArchitecture } from '$lib/server/knowledge-architecture';

const fail=(error:any)=>json({error:String(error?.message||'Knowledge Architecture request failed'),code:String(error?.code||'KNOWLEDGE_ARCHITECTURE_ERROR')},{status:Number(error?.status||500)});

export async function GET({params,cookies}:any){
	try{
		const user=await requireUser(cookies); await assertPanelLicensed();
		const workspace=await getWorkspace(String(params.workspaceId||'')); await requireWorkspaceAccess(user,workspace);
		return json({architecture:await getKnowledgeArchitecture(workspace.id)});
	}catch(error){return fail(error);}
}

export async function PUT({params,request,cookies}:any){
	try{
		const user=await requireUser(cookies); await assertPanelLicensed();
		const workspace=await getWorkspace(String(params.workspaceId||'')); await requireWorkspaceAccess(user,workspace);
		const result=await saveKnowledgeArchitecture(user,workspace.id,await request.json().catch(()=>({})));
		return json({ok:true,...result});
	}catch(error){return fail(error);}
}
