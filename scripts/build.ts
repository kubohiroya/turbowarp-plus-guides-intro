import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import YAML from 'yaml';
import {readAppRelease, appBasePath} from './app-dependency.ts';
import {createPlusLibrary, writeLibraryIndex} from './build-plus-library.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const storyRoot = path.join(root, 'story');
const output = path.join(root, 'docs/work');
const packageRoot = path.join(root,'node_modules/@kubohiroya/turbowarp-kamishibai-app');
const xml = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const hash = (b: Uint8Array|string, algorithm = 'sha256') => createHash(algorithm).update(b).digest('hex');
const guides: Record<string, any> = {};
const choices: Record<string, Record<string,string>> = {};
const art: Record<string, {file:string; kind:string; target?:string; center?:[number,number]}> = {};
const actors: Record<string, string> = {Pura:'PuraIdle', Moko:'MokoIdle'};
function wrap(s: string, width = 27) {
  const rows:string[]=[];let row='',used=0;
  for(const c of Array.from(s)){const weight=c.codePointAt(0)!>0x2ff?1:0.55;if(used+weight>width){rows.push(row);row='';used=0;}row+=c;used+=weight;}
  if(row)rows.push(row);
  return rows;
}
function text(s: string, x: number, y: number, size=18, color='#24314b', weight=500) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}">${xml(s)}</text>`;
}
async function svg(id: string, body: string, width=480,height=360,kind='backdrop',target?:string) {
  const file = `assets/${id}.svg`;
  await writeFile(path.join(storyRoot,file),`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="Noto Sans JP,Hiragino Kaku Gothic ProN,Arial,sans-serif">${body}</g></svg>\n`);
  art[id]={kind,file,...(target?{target}:{})};
}
async function board(id: string, title: string, rows: readonly string[], label:string) {
  let body = '<rect width="480" height="360" fill="#edf3fb"/><path d="M0 265 Q240 205 480 265 V360 H0" fill="#dce9ef"/>';
  body += '<rect x="16" y="14" width="448" height="151" rx="18" fill="white"/><rect x="16" y="14" width="7" height="151" rx="3" fill="#6366df"/>';
  body+=text(label,34,39,11,'#666b88',600)+text(title,34,68,21,'#263454',700);
  let y=92;
  for(const row of rows) for (const line of wrap(row,30)) {body+=text(line,34,y,13.5); y+=20;}
  body+=text('プラ',70,337,11,'#454fbe',700)+text('モコ',355,337,11,'#178c77',700);
  body+=text('Space：次へ　・　緑の旗：最初から',132,352,10,'#626f86');
  await svg(id,body);
}
const show=(actor:string,x:number,y:number,scale=100,skin=actors[actor])=>({[`${actor}.show`]:{skin,x,y,scale}});
const hide=(actor:string)=>({[`${actor}.hide`]:{}});
const cast=()=>[show('Pura',-135,-110,9.5),show('Moko',135,-110,9.5)];
function say(lines: readonly (readonly string[])[]) {
  return lines.map(([speaker,line]) => {
    const seconds = Math.max(4.5,Math.round((Array.from(line).length/6.2+1.4)*10)/10);
    return {[`${speaker==='P'?'Pura':'Moko'}.say`]:{text:line,seconds,styles:['lesson']}};
  });
}
function guide(id:string, spec:any) {guides[id]=spec; return {broadcastMessageAndWait:`lesson:${id}`};}
function nativeChoices(scenes:Record<string,any[]>,prefix:string) {
  for(const [scene,actions]of Object.entries(scenes))for(let i=0;i<actions.length;i++)if(actions[i].touchInputToChangeScene){
    const id=`${prefix}_${scene}`;choices[id]=actions[i].touchInputToChangeScene;
    actions[i]={broadcastMessageAndWait:`choice:${id}`};
  }
}

async function createStory() {
  await mkdir(path.join(storyRoot,'assets'),{recursive:true}); await mkdir(output,{recursive:true});
  art.PuraIdle={kind:'costume',target:'Pura',file:'assets/pura.png'};
  art.MokoIdle={kind:'costume',target:'Moko',file:'assets/moko.png'};
  const common={kamishibai:'4.0',controls:{keymaps:{production:{Space:'navigation.nextAction'}}},bubbleStyles:{lesson:{maxWidth:320,textLocale:'ja',distance:0,tailLength:8}},assets:art,actors};
  const documentFor=(scenes:Record<string,any[]>,backdrop:string)=>{
    const used=new Set([...Object.values(actors),backdrop]);
    for(const actions of Object.values(scenes))for(const action of actions)for(const[key,value]of Object.entries(action)){
      if(key==='stage')used.add(value as string);
      if(key.endsWith('.show'))used.add((value as any).skin);
    }
    return {...common,assets:Object.fromEntries(Object.entries(art).filter(([id])=>used.has(id))),cover:{backdrop},scenes};
  };
  const library = await createPlusLibrary(storyRoot, {actors,art,svg,board,text,show,hide,cast,say,guide});
  nativeChoices(library.scenes,'library');
  const libraryDocument = documentFor(library.scenes,library.backdrop);
  const libraryBackdrops: Record<string,string> = {};
  for (const actions of Object.values(library.scenes)) for (const action of actions) {
    if (typeof action.stage !== 'string') continue;
    const id = action.stage;
    libraryBackdrops[id] = art[id].file;
    action.broadcastMessageAndWait = 'library:backdrop:' + id;
    delete action.stage;
    if (id !== library.backdrop) delete libraryDocument.assets[id];
  }
  // The published runtime has a lower bundle limit than the builder. Keep still backgrounds in the Stage.
  await writeFile(path.join(storyRoot,'plus-library-backdrops.json'),JSON.stringify(libraryBackdrops,null,2)+'\n');
  libraryDocument.assets = Object.fromEntries(Object.entries(libraryDocument.assets).map(([id, {center, ...asset}]) => [id, asset]));
  await writeFile(path.join(storyRoot,'plus-library.k4.yml'),YAML.stringify(libraryDocument,{lineWidth:0,aliasDuplicateObjects:false}));
}

function block(opcode:string,next:string|null,parent:string|null,inputs={},fields={},topLevel=false) {
  return {opcode,next,parent,inputs,fields,topLevel,shadow:false,...(topLevel?{x:40,y:40}:{})};
}
const literal=(s:string)=>[1,[10,s]];
async function actorBase(base:Uint8Array) {
  const files=unzipSync(base);const project=JSON.parse(strFromU8(files['project.json']));
  const story = YAML.parse(await readFile(path.join(storyRoot,'plus-library.k4.yml'),'utf8'));
  const stage=project.targets.find((t:any)=>t.isStage);stage.variables.lessonGuideResult=['ガイドの状態',''];
  // This work begins with its own unit menu rather than the generic App title.
  stage.blocks.titleFlagShow.next='lessonStart';
  stage.blocks.lessonStart=block('kubohiroyakamishibai4_kubohiroyakamishibairuntime4__closeTitle',null,'titleFlagShow');
  delete stage.blocks.titleStageClick;
  delete stage.blocks.titleStageClickClose;
  stage.variables.lessonChoice=['教材の選択',''];
  {
    stage.broadcasts.library_clear='library:clear';
    const backdrops: Record<string,string> = JSON.parse(await readFile(path.join(storyRoot,'plus-library-backdrops.json'),'utf8'));
    for (const [i,[name,file]] of Object.entries(backdrops).entries()) {
      const data = await readFile(path.join(storyRoot,file));
      const assetId = hash(data,'md5');
      const md5ext = assetId + '.svg';
      files[md5ext] = data;
      stage.costumes.push({name,assetId,md5ext,dataFormat:'svg',rotationCenterX:240,rotationCenterY:180});
      const hat = 'library_backdrop_' + i;
      const switcher = hat + '_switch';
      const message = 'library:backdrop:' + name;
      stage.broadcasts[hat] = message;
      stage.blocks[hat] = {...block('event_whenbroadcastreceived',switcher,null,{}, {BROADCAST_OPTION:[message,hat]},true),
        x:1900+380*Math.floor(i/24),y:40+105*(i%24)};
      stage.blocks[switcher] = block('looks_switchbackdropto',null,hat,{BACKDROP:literal(name)});
    }
  }
  for(const [id,g]of Object.entries(guides))stage.broadcasts[`lesson_${id}`]=`lesson:${id}`;
  for(const[id,routes]of Object.entries(choices)){
    const hat=`choice_${id}`,reset=hat+'_reset',wait=hat+'_wait';stage.broadcasts[hat]=`choice:${id}`;
    stage.blocks[hat]={...block('event_whenbroadcastreceived',reset,null,{}, {BROADCAST_OPTION:[`choice:${id}`,hat]},true),x:800,y:1000+Object.keys(stage.broadcasts).length*40};
    stage.blocks[reset]=block('data_setvariableto',wait,hat,{VALUE:literal('')},{VARIABLE:['教材の選択','lessonChoice']});
    const entries=Object.entries(routes);
    const equals=(key:string,value:string,parent:string)=>{
      stage.blocks[key]=block('operator_equals',null,parent,{OPERAND1:[3,key+'_var',[10,'']],OPERAND2:literal(value)});
      stage.blocks[key+'_var']=block('data_variable',null,key,{}, {VARIABLE:['教材の選択','lessonChoice']});return key;
    };
    const conditions=entries.map(([name],i)=>equals(hat+'_eq'+i,name,i===0?wait:hat+'_or'+i));
    let condition=conditions[0];
    for(let i=1;i<conditions.length;i++){const key=hat+'_or'+i;stage.blocks[key]=block('operator_or',null,i===conditions.length-1?wait:hat+'_or'+(i+1),{OPERAND1:[2,condition],OPERAND2:[2,conditions[i]]});stage.blocks[condition].parent=key;condition=key;}
    stage.blocks[wait]=block('control_wait_until',hat+'_if0',reset,{CONDITION:[2,condition]});
    entries.forEach(([name,destination],i)=>{
      const key=hat+'_if'+i,next=hat+'_if'+(i+1),eq=equals(hat+'_route'+i,name,key),go=hat+'_go'+i;
      stage.blocks[key]=block(i<entries.length-1?'control_if_else':'control_if',null,i===0?wait:hat+'_if'+(i-1),{CONDITION:[2,eq],SUBSTACK:[2,go],...(i<entries.length-1?{SUBSTACK2:[2,next]}:{})});
      stage.blocks[go]=block('kubohiroyakamishibai4_kubohiroyakamishibairuntime4__goto',null,key,{SCENE:literal(destination)});
    });
  }
  let layer=1;
  for(const[name,asset]of Object.entries(story.actors as Record<string,string>)) {
    const data=await readFile(path.join(storyRoot,art[asset].file));const png=art[asset].file.endsWith('.png');
    const assetId=hash(data,'md5'),md5ext=`${assetId}.${png?'png':'svg'}`;files[md5ext]=data;
    const blocks:Record<string,any>={};let y=40;
    if(name!=='Pura'&&name!=='Moko'&&name!=='LibraryExample'){
      blocks.clicked=block('event_whenthisspriteclicked','choose',null,{}, {},true);
      blocks.choose=block('data_setvariableto',null,'clicked',{VALUE:literal(name)},{VARIABLE:['教材の選択','lessonChoice']});
    }
    if (name.startsWith('Library')) {
      blocks.clear = {...block('event_whenbroadcastreceived','hideButton',null,{}, {BROADCAST_OPTION:['library:clear','library_clear']},true),y:180};
      blocks.hideButton = block('looks_hide',null,'clear');
    }
    for(const[id,g]of Object.entries(guides).filter(([,g])=>g.actor===name)) {
      blocks[`hat_${id}`]={...block('event_whenbroadcastreceived',`save_${id}`,null,{}, {BROADCAST_OPTION:[`lesson:${id}`,`lesson_${id}`]},true),y};y+=180;
      blocks[`save_${id}`]=block('data_setvariableto',null,`hat_${id}`,{VALUE:[3,`wait_${id}`,[10,'']]},{VARIABLE:['ガイドの状態','lessonGuideResult']});
      blocks[`wait_${id}`]=block('kubohiroyaeditorguide_spriteAndWait',null,`save_${id}`,{TARGET:literal(g.target),SIDE:literal('bottom'),MESSAGE:literal(g.message),ACTION:literal(g.action)});
    }
    const costumes = [{name:asset,assetId,md5ext,dataFormat:png?'png':'svg',
      rotationCenterX:art[asset].center?.[0]??(png?656:105),rotationCenterY:art[asset].center?.[1]??(png?599.5:31),
      ...(png?{bitmapResolution:art[asset].center?1:2}:{})}];
    if (name==='LibraryExample') {
      const examples: Record<string,{file:string;width:number;height:number}> =
        JSON.parse(await readFile(path.join(storyRoot,'plus-library-examples.json'),'utf8'));
      for (const [i,[chapter,example]] of Object.entries(examples).entries()) {
        const costumeName = 'LibraryExample' + chapter;
        if (costumeName !== asset) {
          const bytes = await readFile(path.join(storyRoot,example.file));
          const digest = hash(bytes,'md5');
          const file = digest + '.png';
          files[file] = bytes;
          costumes.push({name:costumeName,assetId:digest,md5ext:file,dataFormat:'png',rotationCenterX:example.width/2,
            rotationCenterY:example.height/2,bitmapResolution:1});
        }
        const hat = 'library_example_' + chapter;
        const message = 'library:example:' + chapter;
        const choose = hat + '_costume';
        const move = hat + '_move';
        const size = hat + '_size';
        const show = hat + '_show';
        const scale = Math.min(437/example.width,191/example.height)*100;
        const number = (n:number) => [1,[4,String(n)]];
        stage.broadcasts[hat] = message;
        blocks[hat] = {...block('event_whenbroadcastreceived',choose,null,{}, {BROADCAST_OPTION:[message,hat]},true),
          x:40+360*Math.floor(i/8),y:300+220*(i%8)};
        blocks[choose] = block('looks_switchcostumeto',move,hat,{COSTUME:literal(costumeName)});
        blocks[move] = block('motion_gotoxy',size,choose,{X:number(0),Y:number(-1)});
        blocks[size] = block('looks_setsizeto',show,move,{SIZE:number(scale)});
        blocks[show] = block('looks_show',null,size);
      }
    }
    project.targets.push({isStage:false,name,variables:{},lists:{},broadcasts:{},blocks,comments:{},currentCostume:0,
      costumes,
      sounds:[],volume:100,layerOrder:layer++,visible:false,x:0,y:0,size:png?18:100,direction:90,draggable:false,rotationStyle:'don\'t rotate'});
  }
  const star='<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><path d="M30 2 37 21 58 22 42 36 48 57 30 45 12 57 18 36 2 22 23 21Z" fill="#ffc857" stroke="#ad6b20" stroke-width="2"/></svg>';
  const starId=hash(star,'md5');files[starId+'.svg']=strToU8(star);
  const b:Record<string,any>={
    key:block('event_whenkeypressed','position',null,{}, {KEY_OPTION:['g',null]},true),
    position:block('motion_gotoxy','call','key',{X:[1,[4,'-160']],Y:[1,[4,'0']]}),
    call:{...block('procedures_call',null,'position',{count:[1,[4,'5']],gap:[1,[4,'60']]}),mutation:{tagName:'mutation',children:[],proccode:'星を並べる %s %s',argumentids:'["count","gap"]',warp:'false'}},
    def:{...block('procedures_definition','repeat',null,{custom_block:[1,'prototype']},{},true),x:420,y:40},
    prototype:{...block('procedures_prototype',null,'def',{count:[1,'count_shadow'],gap:[1,'gap_shadow']}),shadow:true,mutation:{tagName:'mutation',children:[],proccode:'星を並べる %s %s',argumentids:'["count","gap"]',argumentnames:'["個数","間隔"]',argumentdefaults:'["5","60"]',warp:'false'}},
    count_shadow:{...block('argument_reporter_string_number',null,'prototype',{}, {VALUE:['個数',null]}),shadow:true},
    gap_shadow:{...block('argument_reporter_string_number',null,'prototype',{}, {VALUE:['間隔',null]}),shadow:true},
    repeat:block('control_repeat',null,'def',{TIMES:[2,'count_arg'],SUBSTACK:[2,'clone']}),
    count_arg:block('argument_reporter_string_number',null,'repeat',{}, {VALUE:['個数',null]}),
    clone:block('control_create_clone_of','move','repeat',{CLONE_OPTION:[1,'myself']}),
    myself:{...block('control_create_clone_of_menu',null,'clone',{}, {CLONE_OPTION:['_myself_',null]}),shadow:true},
    move:block('motion_changexby','pause','clone',{DX:[2,'gap_arg']}),
    gap_arg:block('argument_reporter_string_number',null,'move',{}, {VALUE:['間隔',null]}),
    pause:block('control_wait',null,'move',{DURATION:[1,[4,'0.3']]}),
    cloned:{...block('control_start_as_clone','visible',null,{}, {},true),x:40,y:250},
    visible:block('looks_show','rest','cloned'),rest:block('control_wait','delete','visible',{DURATION:[1,[4,'1.8']]}),delete:block('control_delete_this_clone',null,'rest'),
  };
  project.targets.push({isStage:false,name:'関数れんしゅう',variables:{},lists:{},broadcasts:{},blocks:b,comments:{},currentCostume:0,costumes:[{name:'星',assetId:starId,md5ext:starId+'.svg',dataFormat:'svg',rotationCenterX:30,rotationCenterY:30}],sounds:[],volume:100,layerOrder:layer,visible:false,x:-160,y:0,size:50,direction:90,draggable:false,rotationStyle:'all around'});
  project.targets.splice(1,0,project.targets.pop());
  project.extensions=[...new Set([...project.extensions,'kubohiroyaeditorguide'])];
  project.meta.agent='Plus Editor lessons / GitHub issue #724';
  files['project.json']=strToU8(JSON.stringify(project));return zipSync(files,{mtime:new Date(1980,0,1)});
}

async function main() {
  await createStory();const release=await readAppRelease();
  const pkg=JSON.parse(await readFile(path.join(packageRoot,'package.json'),'utf8'));assert.equal(pkg.version,release.version);
  const {buildDsl4RuntimeComponent,createDsl4ProductionSourceFrontend,dsl4CliDefaultLimits}=await import(pathToFileURL(path.join(packageRoot,'dist/builder/index.js')).href);
  const base=await readFile(appBasePath(release.version));assert.equal(base.length,release.artifact.size);assert.equal(hash(base),release.artifact.sha256);
  const schema=JSON.parse(await readFile(path.join(packageRoot,'schema/dsl-4.schema.json'),'utf8'));
  const name='plus-library';
  const baseWithActors=await actorBase(base);
  const result=await buildDsl4RuntimeComponent({baseSb3Bytes:baseWithActors,projectRoot:storyRoot,sourceManifest:{formatVersion:1,mode:'external',sourceId:`${name}.k4.yml`,path:`${name}.k4.yml`},sourceFrontend:createDsl4ProductionSourceFrontend(schema,{narrativeControlEnabled:true}),controlProfile:'production',channel:'bundled',...dsl4CliDefaultLimits,featureFlags:{dsl4Runtime:true,dsl4AppShell:true,dsl4BroadcastMessageAndWait:true,dsl4NarrativeControl:true,dsl4TurboWarpActionSurface:true},replaceExisting:true,embeddedSourceDocuments:true});
  const filename=`${name}-4.0.sb3`;await writeFile(path.join(output,filename),result.bytes);const artifact={filename,bytes:result.bytes.length,sha256:hash(result.bytes)};
  const library = await writeLibraryIndex(storyRoot, output);
  await writeFile(path.join(output,'plus-library-coverage.json'),JSON.stringify(library,null,2)+'\n');
  const chapters = await readFile(path.join(storyRoot,'plus-library-chapters.txt'));
  const yaml = await readFile(path.join(storyRoot,'plus-library.k4.yml'));
  const manifest = {
    formatVersion: 1,
    title: 'プラとモコのPlusエディター案内',
    issue: 'kubohiroya/turbowarp-plus-editor#724',
    app: release,
    builder: {name:pkg.name,version:pkg.version},
    sources: {'story/plus-library-chapters.txt':hash(chapters),'story/plus-library.k4.yml':hash(yaml)},
    artifact,
    chapters:library.chapters,
    topics:library.topics,
    recommended:library.recommended,
    totalDialogueSeconds:library.totalDialogueSeconds
  };
  await writeFile(path.join(output,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify(artifact,null,2));
}
main().catch(error=>{console.error(error);if(error.diagnostics)console.error(JSON.stringify(error.diagnostics,null,2));process.exitCode=1;});
