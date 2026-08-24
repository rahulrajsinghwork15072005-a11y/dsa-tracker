import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROG_DIR = path.join(DATA_DIR, 'progress');

if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
if(!fs.existsSync(PROG_DIR)) fs.mkdirSync(PROG_DIR,{recursive:true});
if(!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([],null,2));

const SECRET_FILE = path.join(DATA_DIR, 'jwt_secret');
let JWT_SECRET;
if(fs.existsSync(SECRET_FILE)) JWT_SECRET=fs.readFileSync(SECRET_FILE,'utf-8').trim();
else { JWT_SECRET='dsa-paper-ink-'+Date.now().toString(36); fs.writeFileSync(SECRET_FILE, JWT_SECRET); }

app.use(cors());
app.use(express.json({limit:'5mb'}));
const TRACKER_DIR = path.join(__dirname, '..');
app.use(express.static(TRACKER_DIR, {maxAge:0}));

function readUsers(){ try{ return JSON.parse(fs.readFileSync(USERS_FILE,'utf-8')); }catch{ return [] } }
function writeUsers(u){ fs.writeFileSync(USERS_FILE, JSON.stringify(u,null,2)); }
function progPath(uid){ return path.join(PROG_DIR, uid+'.json'); }
function readProg(uid){
  const p=progPath(uid);
  if(!fs.existsSync(p)) return {topics:{}, questions:{}, notes:{}, topicNotes:{}, chapterNotes:{}, lcUser:'', _time:{}};
  try{ return JSON.parse(fs.readFileSync(p,'utf-8')); }catch{ return {topics:{}, questions:{}, notes:{}, topicNotes:{}, chapterNotes:{}, lcUser:'', _time:{}} }
}
function writeProg(uid, data){ fs.writeFileSync(progPath(uid), JSON.stringify(data,null,2)); }

function auth(req,res,next){
  const h=req.headers.authorization||'';
  const token=h.replace('Bearer ','');
  if(!token) return res.status(401).json({error:'no token'});
  try{ const d=jwt.verify(token, JWT_SECRET); req.user=d; next(); }catch{ return res.status(401).json({error:'bad token'}); }
}

app.post('/api/register', async (req,res)=>{
  const {email, password, name} = req.body;
  if(!email||!password) return res.status(400).json({error:'email+password required'});
  const users=readUsers();
  if(users.find(u=>u.email.toLowerCase()===email.toLowerCase())) return res.status(400).json({error:'email exists'});
  const hash=await bcrypt.hash(password, 10);
  const user={id: Date.now().toString(36)+Math.random().toString(36).slice(2), email: email.toLowerCase(), name: name||email.split('@')[0], password: hash, created: new Date().toISOString()};
  users.push(user);
  writeUsers(users);
  writeProg(user.id, {topics:{}, questions:{}, notes:{}, topicNotes:{}, chapterNotes:{}, lcUser:'', _time:{}});
  const token=jwt.sign({id:user.id, email:user.email, name:user.name}, JWT_SECRET, {expiresIn:'30d'});
  res.json({token, user:{id:user.id, email:user.email, name:user.name}});
});

app.post('/api/login', async (req,res)=>{
  const {email, password} = req.body;
  const users=readUsers();
  const u=users.find(x=>x.email.toLowerCase()===email.toLowerCase());
  if(!u) return res.status(401).json({error:'no user'});
  const ok=await bcrypt.compare(password, u.password);
  if(!ok) return res.status(401).json({error:'bad password'});
  const token=jwt.sign({id:u.id, email:u.email, name:u.name}, JWT_SECRET, {expiresIn:'30d'});
  res.json({token, user:{id:u.id, email:u.email, name:u.name}});
});

app.get('/api/me', auth, (req,res)=>{
  res.json({user:req.user});
});

app.get('/api/progress', auth, (req,res)=>{
  res.json(readProg(req.user.id));
});

app.post('/api/progress', auth, (req,res)=>{
  const cur=readProg(req.user.id);
  const incoming=req.body||{};
  const merged={...cur, ...incoming, topics:{...cur.topics, ...(incoming.topics||{})}, questions:{...cur.questions, ...(incoming.questions||{})}, notes:{...cur.notes, ...(incoming.notes||{})}, topicNotes:{...cur.topicNotes, ...(incoming.topicNotes||{})}, chapterNotes:{...cur.chapterNotes, ...(incoming.chapterNotes||{})}, _time:{...cur._time, ...(incoming._time||{})}};
  if(incoming.lcUser!==undefined) merged.lcUser=incoming.lcUser;
  writeProg(req.user.id, merged);
  res.json(merged);
});

app.get('/api/lc/:username', async (req,res)=>{
  const username=req.params.username;
  if(!username) return res.status(400).json({error:'username'});
  const urls=[
    `https://alfa-leetcode-api.onrender.com/${username}/acSubmission`,
    `https://leetcode-stats-api.herokuapp.com/${username}`
  ];
  for(const url of urls){
    try{
      const r=await fetch(url, {headers:{'User-Agent':'Mozilla/5.0'}});
      if(!r.ok) continue;
      const j=await r.json();
      return res.json({source:url, data:j});
    }catch(e){ continue; }
  }
  res.status(502).json({error:'could not fetch LC'});
});

app.get('/api/health', (req,res)=> res.json({ok:true, users: readUsers().length}));

app.get('*', (req,res)=>{
  res.sendFile(path.join(TRACKER_DIR,'index.html'));
});

app.listen(PORT, ()=> console.log(`DSA Tracker dynamic server at http://localhost:${PORT} — serving ${TRACKER_DIR}`));
