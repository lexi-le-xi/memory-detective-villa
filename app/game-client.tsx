"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mansion3D from "./mansion-3d";

type Floor = 1 | 2;
type Lang = "zh" | "en";
type Point = { x: number; y: number };
type Actor = Point & { id: string; name: string; room: string; color: string; floor: Floor };
type Clue = Point & { id: string; name: string; detail: string; floor: Floor };
type DialogueLine = { speaker: string; text: string; follow?: string };
type Question = { id: string; prompt: string; response: DialogueLine[] };
type SuspectDialogue = { opening: DialogueLine; questions: Question[] };

const MAP_W = 960;
const MAP_H = 600;
const PLAYER_R = 12;

const actors: Actor[] = [
  { id: "amy", name: "Amy", room: "餐厅", x: 546, y: 220, floor: 1, color: "#78947d" },
  { id: "coco", name: "Coco", room: "客厅", x: 300, y: 370, floor: 1, color: "#9c6f78" },
  { id: "dean", name: "Dean", room: "管家室", x: 795, y: 392, floor: 1, color: "#727e91" },
  { id: "ella", name: "Ella", room: "厨房", x: 714, y: 245, floor: 1, color: "#b89564" },
  { id: "ben", name: "Ben", room: "二楼走廊", x: 455, y: 290, floor: 2, color: "#8277a1" },
  { id: "felix", name: "Felix", room: "主卧", x: 742, y: 225, floor: 2, color: "#4a4543" },
];

const clues: Clue[] = [
  { id: "milk", name: "牛奶杯", detail: "杯底有少量白色沉淀，需要结合Ella的记忆判断下药时机。", x: 722, y: 175, floor: 1 },
  { id: "clock", name: "客厅座钟", detail: "座钟停顿过一次，Coco记忆中的时间从22:14跳到了22:22。", x: 210, y: 313, floor: 1 },
  { id: "log", name: "跳闸日志", detail: "22:12，Dean离开客厅处理东侧跳闸，Coco的不在场证明出现空白。", x: 840, y: 370, floor: 1 },
  { id: "paper", name: "平整的报纸", detail: "当天报纸平整地落在床边，不可能产生Ben听到的持续揉纸声。", x: 700, y: 145, floor: 2 },
  { id: "cord", name: "窗帘绳", detail: "绳索滑轮有新鲜摩擦痕迹，并残留Coco常用护手霜的气味。", x: 828, y: 114, floor: 2 },
  { id: "lock", name: "自动门锁", detail: "门被带上后会自动锁止，所谓密室不需要凶手从内部反锁。", x: 605, y: 220, floor: 2 },
];

/**
 * Which suspects must have been talked to, and which other clues must
 * already be found, before a clue exists in the world. Missing from this
 * map = always available (Tier 0).
 *
 * Tier 1 (clock, log) both exist to contradict Coco's alibi, so they only
 * appear once the player has actually heard that alibi — showing them
 * cold wastes the "wait, that doesn't match what she said" moment.
 * Tier 2 (cord) is the piece that most directly implicates Coco, so it's
 * gated behind having both Tier-1 contradictions in hand. `lock` is left
 * ungated: it explains the *mechanism* of the locked room, not who's
 * guilty, so it doesn't need a suspect-specific unlock the way cord does
 * — a design call, revisit if playtesting disagrees.
 */
const clueRequirements: Record<string, { suspects?: string[]; clues?: string[] }> = {
  clock: { suspects: ["coco"] },
  log: { suspects: ["coco"] },
  cord: { clues: ["clock", "log"] },
};

function isClueAvailable(id: string, found: string[], talked: string[]): boolean {
  const req = clueRequirements[id];
  if (!req) return true;
  if (req.suspects && !req.suspects.every((s) => talked.includes(s))) return false;
  if (req.clues && !req.clues.every((c) => found.includes(c))) return false;
  return true;
}

const dialogue: Record<string, SuspectDialogue> = {
  amy: {
    opening: { speaker: "Amy", text: "有什么事吗？我今晚已经被问过一遍了。" },
    questions: [
      {
        id: "whereabouts",
        prompt: "21:50左右你在哪里？",
        response: [
          { speaker: "Amy", text: "我大概21:50经过主卧，然后就回客厅了。我从没碰过那杯牛奶。" },
          { speaker: "Amy", text: "22点之后我就没上过二楼，一步都没有。" },
        ],
      },
      {
        id: "birthday-cake",
        prompt: "生日蛋糕好像切得很晚，那晚都准备了什么？",
        response: [
          { speaker: "Amy", text: "……（停顿）我不知道，反正我没碰过牛奶，我跟那杯牛奶一点关系都没有。", follow: "奇怪：你只问了蛋糕，她却主动否认了牛奶——没人问起的事。" },
          { speaker: "Amy", text: "厨房谁都能进。你应该先问负责准备牛奶的Ella。" },
        ],
      },
      {
        id: "coco",
        prompt: "那天晚上你见到Coco了吗？",
        response: [
          { speaker: "Amy", text: "我们俩晚上没什么交集，她好像一直在客厅陪Dean说话吧，我没太注意。" },
        ],
      },
    ],
  },
  coco: {
    opening: { speaker: "Coco", text: "还要问多久？我已经说过好几遍了。" },
    questions: [
      {
        id: "whereabouts",
        prompt: "22:00到22:30之间你在哪里？",
        response: [
          { speaker: "Coco", text: "我在客厅，一直和Dean聊天。就是随便聊聊。" },
          { speaker: "Coco", text: "没有，一次都没有。我整晚都没上过楼。", follow: "她把整个不在场证明都压在Dean身上。" },
        ],
      },
      {
        id: "leave-room",
        prompt: "你有没有离开过客厅，哪怕一下？",
        response: [
          { speaker: "Coco", text: "没有那种事，我一直在那，你可以问Dean。" },
        ],
      },
      {
        id: "curtains",
        prompt: "最近碰过他卧室的窗帘吗？",
        response: [
          { speaker: "Coco", text: "（语气略带防备）我为什么要碰那个？我都好几周没进过他房间了。" },
        ],
      },
    ],
  },
  dean: {
    opening: { speaker: "Dean", text: "警官，需要我做什么吗？" },
    questions: [
      {
        id: "whereabouts",
        prompt: "22:00到22:30之间你在哪里？",
        response: [
          { speaker: "Dean", text: "我在客厅，和Coco在一起，我们聊了挺久。" },
          { speaker: "Dean", text: "没有，我们俩一直都在那。" },
        ],
      },
      {
        id: "checked-felix",
        prompt: "你有去看过Felix吗？",
        response: [
          { speaker: "Dean", text: "22:30左右我上去巡视了一下，平时都这么做。" },
          { speaker: "Dean", text: "房间很安静，我以为他已经睡了，就没进去。" },
        ],
      },
      {
        id: "unusual",
        prompt: "那天晚上还有什么不寻常的事吗？",
        response: [
          { speaker: "Dean", text: "（犹豫了一下）……没有，没什么不寻常的。就是很平常的一晚。", follow: "他说话时看了一眼洗衣房方向。" },
        ],
      },
    ],
  },
  ben: {
    opening: { speaker: "Ben", text: "呃……我需要坐下吗？" },
    questions: [
      {
        id: "upstairs",
        prompt: "那天晚上你有上二楼吗？",
        response: [
          { speaker: "Ben", text: "有，我大概22点过后上去拿了个东西，路过主卧门口的时候顺便看了一眼。" },
          { speaker: "Ben", text: "应该是22:18左右吧，房间里黑着，没开灯。" },
        ],
      },
      {
        id: "heard",
        prompt: "黑着灯的话，你怎么知道里面有人？",
        response: [
          { speaker: "Ben", text: "我听到里面有翻报纸的声音，一直在响，哗啦哗啦的，挺清楚的。", follow: "黑暗中无法读报，声音可能是伪造的。" },
        ],
      },
      {
        id: "no-knock",
        prompt: "你为什么没有敲门？",
        response: [
          { speaker: "Ben", text: "就几秒钟吧，没敲门，毕竟是他生日，我也不想打扰他。" },
          { speaker: "Ben", text: "我欠Felix钱……我只是怕见他。" },
        ],
      },
    ],
  },
  ella: {
    opening: { speaker: "Ella", text: "厨房那边还有事要收拾，能快点吗？" },
    questions: [
      {
        id: "whereabouts",
        prompt: "21:45左右你在做什么？",
        response: [
          { speaker: "Ella", text: "我刚打扫完二楼，下楼去厨房给Felix热牛奶。中途去储藏室拿过托盘。" },
        ],
      },
      {
        id: "unusual",
        prompt: "下楼时有没有注意到什么不一样的？",
        response: [
          { speaker: "Ella", text: "楼梯那边有个人影，走得挺快的，我没看清是谁，就是很快闪过去了。" },
          { speaker: "Ella", text: "回来时我看见一个灰绿色袖口从餐厅侧门闪过去。", follow: "Amy今晚穿着灰绿色外套。" },
        ],
      },
      {
        id: "after",
        prompt: "送完牛奶之后你还看到谁上楼了吗？",
        response: [
          { speaker: "Ella", text: "没有，我没看到。我一直在厨房忙，没怎么注意楼梯那边。" },
        ],
      },
    ],
  },
};

const memoryScripts: Record<string, { title: string; tone: string; steps: [string, string, string, string][] }> = {
  felix: {
    title: "最后清醒的五分钟",
    tone: "#50483e",
    steps: [
      ["22:00 · 主卧", "Ella把温热的牛奶放在床边。台灯亮着，当天的报纸摊在Felix手中。", "▤", "拿起杯子"],
      ["22:03 · 床边", "牛奶入口时有一点不同寻常的苦味。Felix停顿片刻，仍然喝了第二口。", "◒", "放下杯子"],
      ["22:07 · 主卧", "报纸从手中滑落，字迹开始重叠。房间里的声音越来越远。", "≋", "尝试呼喊"],
      ["22:10 · 黑暗", "手臂无法抬起，视野完全消失。记忆在卧室门再次开启之前中断。", "●", "结束残留记忆"],
    ],
  },
  amy: {
    title: "被删去的厨房",
    tone: "#485f51",
    steps: [
      ["21:46 · 餐厅侧门", "Amy隔着门看见Ella把牛奶倒入杯中。", "◩", "继续观察"],
      ["21:48 · 厨房", "储藏室的门关上了。工作台旁只剩炉火声。", "♨", "走近杯子"],
      ["21:48 · 工作台", "一只手拿起牛奶杯。记忆中的药瓶标签被白光抹去。", "◒", "触碰空白"],
      ["21:49 · 餐厅", "灰绿色袖口少了一颗袖扣。厨房侧门在身后缓缓合上。", "◐", "离开记忆"],
    ],
  },
  coco: {
    title: "缺失的七分钟",
    tone: "#69434d",
    steps: [
      ["22:14 · 客厅", "Dean起身处理跳闸。座钟的秒针仍在移动。", "◷", "等待"],
      ["22:15 · 门厅", "记忆突然跳到了楼梯前。身后的客厅没有关门声。", "⇧", "走上楼梯"],
      ["22:18 · 主卧", "房间没有灯。窗边传来滑轮摩擦，壁炉旁的旧报纸被拿起。", "▤", "聆听"],
      ["22:22 · 客厅", "酒杯仍在原位，座钟却已经快进了七分钟。", "◷", "离开记忆"],
    ],
  },
  dean: {
    title: "循环的十三秒",
    tone: "#465264",
    steps: [
      ["22:12 · 管家室", "东侧线路跳闸。三路监控同时闪了一下。", "▦", "查看屏幕"],
      ["22:15 · 监控屏", "客厅里的笑声和Coco抬手的动作完整重复了一遍。", "↻", "重放画面"],
      ["22:22 · 文件列表", "一段录像先被复制，随后主文件被十三秒循环覆盖。", "▣", "查看时间"],
      ["22:25 · 侧走廊", "Dean握着存储卡，看向通往洗衣房的门。", "▪", "离开记忆"],
    ],
  },
  ben: {
    title: "黑暗中的纸声",
    tone: "#554c70",
    steps: [
      ["22:17 · 客房", "Ben拿起遗落的耳机，设备仍在录制走廊环境声。", "◉", "返回走廊"],
      ["22:18 · 主卧门外", "门缝下没有灯光，里面却持续传来纸张摩擦声。", "▤", "靠近门"],
      ["22:19 · 门外", "雷声之间夹着短促的金属滑轮声，随后是两次脚步。", "≋", "分辨声音"],
      ["22:20 · 楼梯口", "纸声停止。Ben没有敲门，转身走下楼梯。", "⇩", "离开记忆"],
    ],
  },
  ella: {
    title: "无人看管的三分钟",
    tone: "#806844",
    steps: [
      ["21:45 · 厨房", "Ella点燃炉灶，把热好的牛奶倒入杯中。", "♨", "寻找托盘"],
      ["21:48 · 储藏室", "厨房侧门响了一下，随后传来玻璃轻碰工作台的声音。", "◫", "从门缝观察"],
      ["21:49 · 厨房", "一个灰绿色袖口从餐厅侧门消失，杯托上留下两道位置不同的水环。", "◒", "端起托盘"],
      ["22:00 · 主卧", "Felix接过牛奶。台灯亮着，当天的报纸摊在他手中。", "▤", "离开记忆"],
    ],
  },
};

const dialogueEn: Record<string, SuspectDialogue> = {
  amy: {
    opening: { speaker: "Amy", text: "Is this necessary? I've already been asked once tonight." },
    questions: [
      {
        id: "whereabouts",
        prompt: "Where were you around 21:50?",
        response: [
          { speaker: "Amy", text: "I passed the master bedroom around 21:50 and went back to the living room. I never touched that milk." },
          { speaker: "Amy", text: "I didn't go up to the second floor at all after 22:00 — not once." },
        ],
      },
      {
        id: "birthday-cake",
        prompt: "The birthday cake was cut pretty late — what was prepared that night?",
        response: [
          { speaker: "Amy", text: "...(pause) I don't know. Anyway, I never touched the milk. I had nothing to do with that cup at all.", follow: "Odd — you only asked about the cake, and she's already denying the milk. Nobody asked about that." },
          { speaker: "Amy", text: "Anyone could enter the kitchen. You should question the person who prepared it." },
        ],
      },
      {
        id: "coco",
        prompt: "Did you see Coco that night?",
        response: [
          { speaker: "Amy", text: "We didn't really cross paths. I think she was in the living room talking with Dean — I wasn't really paying attention." },
        ],
      },
    ],
  },
  coco: {
    opening: { speaker: "Coco", text: "How much longer is this going to take? I've said this already." },
    questions: [
      {
        id: "whereabouts",
        prompt: "Where were you between 22:00 and 22:30?",
        response: [
          { speaker: "Coco", text: "I was in the living room with Dean. We were just chatting." },
          { speaker: "Coco", text: "No, not once. I didn't go upstairs at all that night.", follow: "She's resting her entire alibi on Dean." },
        ],
      },
      {
        id: "leave-room",
        prompt: "Did you leave the room, even for a moment?",
        response: [
          { speaker: "Coco", text: "No, nothing like that. I was there the whole time — you can ask Dean." },
        ],
      },
      {
        id: "curtains",
        prompt: "Have you touched the curtains in his room recently?",
        response: [
          { speaker: "Coco", text: "(slightly defensive) Why would I? I haven't even been in his room in weeks." },
        ],
      },
    ],
  },
  dean: {
    opening: { speaker: "Dean", text: "Officer. What do you need from me?" },
    questions: [
      {
        id: "whereabouts",
        prompt: "Where were you between 22:00 and 22:30?",
        response: [
          { speaker: "Dean", text: "I was in the living room, with Coco. We talked for a while." },
          { speaker: "Dean", text: "No. We were both there the whole time." },
        ],
      },
      {
        id: "checked-felix",
        prompt: "Did you check on Felix at any point?",
        response: [
          { speaker: "Dean", text: "I went up to patrol around 22:30, like I always do." },
          { speaker: "Dean", text: "Everything was quiet. I assumed he'd gone to sleep, so I didn't go in." },
        ],
      },
      {
        id: "unusual",
        prompt: "Anything unusual that night?",
        response: [
          { speaker: "Dean", text: "(hesitates) No... nothing unusual. It was a normal night.", follow: "He glanced toward the laundry room as he said that." },
        ],
      },
    ],
  },
  ben: {
    opening: { speaker: "Ben", text: "Uh — do I need to sit down for this?" },
    questions: [
      {
        id: "upstairs",
        prompt: "Did you go up to the second floor that night?",
        response: [
          { speaker: "Ben", text: "Yeah, I went up sometime after 22:00 to grab something. I glanced toward the master bedroom door on my way." },
          { speaker: "Ben", text: "Around 22:18, I think. The room was dark, no lights on." },
        ],
      },
      {
        id: "heard",
        prompt: "Dark? Then how did you know someone was in there?",
        response: [
          { speaker: "Ben", text: "I heard the sound of newspaper pages turning — it kept going, kind of a rustling sound, pretty clear.", follow: "Newspapers can't be read in the dark. That sound may have been staged." },
        ],
      },
      {
        id: "no-knock",
        prompt: "Why didn't you knock?",
        response: [
          { speaker: "Ben", text: "Just a few seconds. I didn't knock — it was his birthday, I didn't want to bother him." },
          { speaker: "Ben", text: "I owed Felix money... I was afraid to face him." },
        ],
      },
    ],
  },
  ella: {
    opening: { speaker: "Ella", text: "I still have things to clean up in the kitchen — can we make this quick?" },
    questions: [
      {
        id: "whereabouts",
        prompt: "What were you doing around 21:45?",
        response: [
          { speaker: "Ella", text: "I'd just finished cleaning the second floor, and went down to warm up milk for Felix. I went into the pantry for a tray along the way." },
        ],
      },
      {
        id: "unusual",
        prompt: "Did you notice anything unusual on your way down?",
        response: [
          { speaker: "Ella", text: "There was someone near the staircase, moving pretty fast. I couldn't tell who it was." },
          { speaker: "Ella", text: "When I came back, I saw a gray-green sleeve disappear through the dining-room door.", follow: "Amy was wearing a gray-green jacket tonight." },
        ],
      },
      {
        id: "after",
        prompt: "Did you see anyone go upstairs after you delivered the milk?",
        response: [
          { speaker: "Ella", text: "No, I didn't see anyone. I was busy in the kitchen — wasn't really watching the stairs." },
        ],
      },
    ],
  },
};

const memoryScriptsEn: typeof memoryScripts = {
  felix: { title: "The Last Five Conscious Minutes", tone: "#50483e", steps: [
    ["22:00 · Master Bedroom", "Ella sets the warm milk beside the bed. The lamp is on and today's paper is open in Felix's hands.", "▤", "Pick up the cup"],
    ["22:03 · Bedside", "The milk tastes faintly bitter. Felix pauses, then takes a second sip.", "◒", "Put down the cup"],
    ["22:07 · Master Bedroom", "The paper slips from his hands. The print doubles and every sound recedes.", "≋", "Try to call out"],
    ["22:10 · Darkness", "His arms will not move. The memory ends before the bedroom door opens again.", "●", "End residual memory"],
  ]},
  amy: { title: "The Missing Kitchen", tone: "#485f51", steps: [
    ["21:46 · Dining-Room Door", "Amy watches Ella pour the milk through the half-open door.", "◩", "Keep watching"],
    ["21:48 · Kitchen", "The pantry door closes. Only the stove can be heard beside the unattended cup.", "♨", "Approach the cup"],
    ["21:48 · Worktop", "A hand lifts the cup. White light erases the label on a medicine bottle.", "◒", "Touch the blank space"],
    ["21:49 · Dining Room", "A button is missing from a gray-green cuff. The kitchen door closes behind it.", "◐", "Leave memory"],
  ]},
  coco: { title: "The Missing Seven Minutes", tone: "#69434d", steps: [
    ["22:14 · Living Room", "Dean gets up to deal with the breaker. The clock's second hand keeps moving.", "◷", "Wait"],
    ["22:15 · Foyer", "The memory jumps to the stairs. There was no sound of the living-room door closing.", "⇧", "Go upstairs"],
    ["22:18 · Master Bedroom", "The room is dark. A curtain pulley scrapes, and an old newspaper is lifted beside the fireplace.", "▤", "Listen"],
    ["22:22 · Living Room", "The glass has not moved, but the clock has advanced seven minutes.", "◷", "Leave memory"],
  ]},
  dean: { title: "The Repeating Thirteen Seconds", tone: "#465264", steps: [
    ["22:12 · Monitor Room", "The east circuit trips. All three camera feeds flicker at once.", "▦", "Check the screens"],
    ["22:15 · Camera Feed", "The same laugh and the same movement of Coco's hand repeat perfectly.", "↻", "Replay footage"],
    ["22:22 · File List", "A recording is copied before the main file is replaced by a thirteen-second loop.", "▣", "Check the time"],
    ["22:25 · Side Hall", "Dean holds a memory card and looks toward the laundry-room door.", "▪", "Leave memory"],
  ]},
  ben: { title: "Paper in the Dark", tone: "#554c70", steps: [
    ["22:17 · Guest Room", "Ben retrieves his headphones. The device is still recording the hallway.", "◉", "Return to the hall"],
    ["22:18 · Bedroom Door", "No light shows beneath the door, yet paper continues to rustle inside.", "▤", "Move closer"],
    ["22:19 · Outside the Door", "Between thunderclaps comes a metal pulley scrape, followed by two footsteps.", "≋", "Separate the sounds"],
    ["22:20 · Stairway", "The paper sound stops. Ben does not knock and walks downstairs.", "⇩", "Leave memory"],
  ]},
  ella: { title: "Three Minutes Unattended", tone: "#806844", steps: [
    ["21:45 · Kitchen", "Ella lights the stove and pours the warmed milk into a cup.", "♨", "Find the tray"],
    ["21:48 · Pantry", "The kitchen door moves, followed by glass touching the worktop.", "◫", "Look through the gap"],
    ["21:49 · Kitchen", "A gray-green sleeve disappears. Two water rings now mark different positions on the tray.", "◒", "Lift the tray"],
    ["22:00 · Master Bedroom", "Felix takes the milk. The lamp is on and today's newspaper is open in his hands.", "▤", "Leave memory"],
  ]},
};

const clueEn: Record<string, { name: string; detail: string }> = {
  milk: { name: "Milk Cup", detail: "A pale residue remains at the bottom. Ella's memory may reveal when it was added." },
  clock: { name: "Living-Room Clock", detail: "The clock stopped once. Coco's memory jumps from 22:14 to 22:22." },
  log: { name: "Breaker Log", detail: "At 22:12 Dean left the living room, creating a gap in Coco's alibi." },
  paper: { name: "Flat Newspaper", detail: "Today's paper lies flat and could not have made the continuous sound Ben heard." },
  cord: { name: "Curtain Cord", detail: "The pulley has fresh wear and a trace of Coco's usual hand cream." },
  lock: { name: "Automatic Lock", detail: "The door locks when closed. The killer did not need to lock it from inside." },
};

const publicProfiles = [
  {
    id: "felix", name: "Felix", color: "#4a4543",
    zh: { role: "死者 · 别墅主人", relation: "本案死者", note: "案发当晚被发现死于二楼主卧。" },
    en: { role: "Victim · Owner of the Villa", relation: "Victim of Case 07", note: "Found dead in the second-floor master bedroom." },
  },
  {
    id: "amy", name: "Amy", color: "#78947d",
    zh: { role: "Felix的侄女", relation: "家族成员", note: "案发当晚参加了别墅中的家族聚会。" },
    en: { role: "Felix's Niece", relation: "Family member", note: "Attended the family gathering at the villa that evening." },
  },
  {
    id: "coco", name: "Coco", color: "#9c6f78",
    zh: { role: "Felix的表亲", relation: "家族成员", note: "案发后一直留在客厅，等待调查。" },
    en: { role: "Felix's Cousin", relation: "Family member", note: "Has remained in the living room since the body was found." },
  },
  {
    id: "ben", name: "Ben", color: "#8277a1",
    zh: { role: "Felix的侄子", relation: "家族成员", note: "案发前曾因私人物品前往二楼客房。" },
    en: { role: "Felix's Nephew", relation: "Family member", note: "Went upstairs to the guest room shortly before the discovery." },
  },
  {
    id: "dean", name: "Dean", color: "#727e91",
    zh: { role: "别墅管家", relation: "受雇于Felix", note: "负责别墅日常管理、巡查及安防设备。" },
    en: { role: "Villa Butler", relation: "Employed by Felix", note: "Responsible for the house, patrols, and security equipment." },
  },
  {
    id: "ella", name: "Ella", color: "#b89564",
    zh: { role: "别墅女仆", relation: "受雇于Felix", note: "负责厨房与起居服务，案发当晚仍在值班。" },
    en: { role: "Villa Maid", relation: "Employed by Felix", note: "Responsible for kitchen and household service; on duty that night." },
  },
] as const;

function RelationshipProfiles({ lang }: { lang: Lang }) {
  const felix = publicProfiles[0];
  const others = publicProfiles.slice(1);
  const avatar = (id: string) => <div className={`relation-avatar avatar-${id}`} aria-hidden="true"><i className="avatar-hair"/><i className="avatar-face"><i className="avatar-eye left"/><i className="avatar-eye right"/><i className="avatar-nose"/><i className="avatar-mouth"/></i><i className="avatar-body"/><i className="avatar-accessory"/></div>;
  return <>
    <section className="relationship-section" aria-label={lang === "zh" ? "人物关系图" : "Relationship map"}>
      <div className="relationship-heading"><b>{lang === "zh" ? "公开人物关系" : "KNOWN RELATIONSHIPS"}</b><span>{lang === "zh" ? "调查开始前已确认" : "Confirmed before investigation"}</span></div>
      <div className="relationship-map">
        <div className="relation-line line-amy"/><div className="relation-line line-coco"/><div className="relation-line line-ben"/><div className="relation-line line-dean"/><div className="relation-line line-ella"/>
        <article className="relation-person relation-felix victim">{avatar("felix")}<div><b>Felix</b><span>{lang === "zh" ? "死者 · 别墅主人" : "Victim · Villa Owner"}</span><p>{felix[lang].note}</p></div></article>
        {others.map(profile => <article className={`relation-person relation-${profile.id}`} key={profile.id}>
          {avatar(profile.id)}
          <div><b>{profile.name}</b><span>{profile[lang].role}</span><p>{profile[lang].note}</p></div>
        </article>)}
      </div>
    </section>
  </>;
}

const ui = {
  zh: {
    title: "别墅谋杀案", summary: "暴雨封锁了山路。Felix死在自动上锁的主卧里，五名仍留在别墅中的人各自隐瞒了一段记忆。", enter: "进入别墅",
    controls: "使用方向键移动与转向 · 靠近目标按 E 或 Enter 互动", evidence: "物证", witnesses: "证人", memories: "记忆", restart: "重新开始", board: "打开案件板",
    help: "移动到目标附近，或直接点击人物 / 金色物证 / 楼梯", up: "前往二楼", down: "返回一楼", investigate: "调查", talkPrefix: "与", talkSuffix: "对话", inspectFelix: "检查Felix",
    continue: "继续询问", endTalk: "结束对话", enterMemory: "进入", replayMemory: "重看", possessiveMemory: "的记忆", exitMemory: "退出记忆", memoryRecorded: "的记忆已记录",
    askQuestion: "你想问什么？", backToQuestions: "返回提问", asked: "已问过", endInterview: "结束询问",
    investigator: "调查员 Mara", footer: "方向键操作 · E互动 · 楼层按钮切换楼层", found: "获得物证：", caseBoard: "案件板", reconstruct: "重建别墅谋杀案", experienced: "已体验记忆",
    unknown: "未发现", keepExploring: "继续探索别墅", drugQuestion: "谁给牛奶下药？", killerQuestion: "谁实施勒杀？", roomQuestion: "密室如何形成？", choose: "请选择",
    autoLock: "门关闭后自动锁止", secret: "凶手从密道离开", inside: "死者从内部反锁", submit: "提交最终推理", needMore: "需要询问所有人、体验六段记忆并找到至少5项物证",
    finalTruth: "完整真相", wrong: "推理仍有矛盾", goodEnding: "Amy利用Ella离开的空隙给牛奶下药。Coco在Felix昏迷后上楼，用窗帘绳将他勒死，再借自动门锁制造密室。黑暗中的报纸声只是伪造死亡时间的表演。", badEnding: "现有证据无法支持你的结论。回到别墅，重新比较牛奶、报纸声和自动门锁。", returnExplore: "返回别墅自由探索", continueInvestigation: "继续调查",
    profilesEyebrow: "警方到场前记录", profilesTitle: "涉案人物档案", profilesIntro: "以下仅为调查开始前已经确认的公开身份。隐藏关系、矛盾与动机需要你进入别墅后自行查明。", publicRecord: "公开档案", enterAfterProfiles: "确认档案，进入别墅", backToBrief: "返回案件简介", profilesButton: "人物档案", closeProfiles: "关闭档案",
  },
  en: {
    title: "Murder at the Old Villa", summary: "A storm has cut off the mountain road. Felix is dead in an automatically locked bedroom, and each of the five people still inside is hiding part of a memory.", enter: "Enter the Villa",
    controls: "Use the arrow keys to move and turn · Press E or Enter near a target", evidence: "Evidence", witnesses: "Witnesses", memories: "Memories", restart: "Restart", board: "Case Board",
    help: "Move near a target, or click a person, gold evidence marker, or the stairs", up: "Go Upstairs", down: "Go Downstairs", investigate: "Investigate", talkPrefix: "Talk to ", talkSuffix: "", inspectFelix: "Inspect Felix",
    continue: "Continue", endTalk: "End Conversation", enterMemory: "Enter ", replayMemory: "Replay ", possessiveMemory: "'s Memory", exitMemory: "Exit Memory", memoryRecorded: "'s memory recorded",
    askQuestion: "What do you want to ask?", backToQuestions: "Back to questions", asked: "Asked", endInterview: "End interview",
    investigator: "Investigator Mara", footer: "Arrow keys to move · E to interact · floor button to change floors", found: "Evidence found: ", caseBoard: "CASE 07 · CASE BOARD", reconstruct: "Reconstruct the Villa Murder", experienced: "Memories viewed",
    unknown: "Undiscovered", keepExploring: "Keep exploring the villa", drugQuestion: "Who drugged the milk?", killerQuestion: "Who strangled Felix?", roomQuestion: "How was the locked room created?", choose: "Choose",
    autoLock: "The door locked automatically", secret: "The killer used a secret passage", inside: "Felix locked it from inside", submit: "Submit Final Deduction", needMore: "Question everyone, view all six memories, and find at least five pieces of evidence",
    finalTruth: "The Complete Truth", wrong: "The Deduction Contradicts the Evidence", goodEnding: "Amy drugged the milk while Ella was away. After Felix lost consciousness, Coco went upstairs, strangled him with the curtain cord, and used the automatic lock to create a false locked room. The newspaper sound only disguised the time of death.", badEnding: "The evidence does not support this conclusion. Return to the villa and compare the milk, the newspaper sound, and the automatic lock.", returnExplore: "Return to Free Exploration", continueInvestigation: "Continue Investigating",
    profilesEyebrow: "RECORDED BEFORE POLICE ARRIVAL", profilesTitle: "Persons of Interest", profilesIntro: "These are the public identities confirmed before the investigation begins. Hidden relationships, conflicts, and motives must be uncovered inside the villa.", publicRecord: "Public Record", enterAfterProfiles: "Confirm Files · Enter Villa", backToBrief: "Back to Case Brief", profilesButton: "People", closeProfiles: "Close Files",
  },
};

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawRoom(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string) {
  ctx.fillStyle = "#211d1b";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#7c6a55";
  ctx.lineWidth = 5;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "rgba(226,211,179,.55)";
  ctx.font = "600 14px sans-serif";
  ctx.fillText(label, x + 14, y + 24);
}

function MansionCanvas({
  floor,
  lang,
  player,
  setPlayer,
  found,
  onInteract,
}: {
  floor: Floor;
  lang: Lang;
  player: Point;
  setPlayer: (p: Point) => void;
  found: string[];
  onInteract: (kind: "actor" | "clue" | "stairs", id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef(new Set<string>());
  const playerRef = useRef(player);
  const onInteractRef = useRef(onInteract);
  const nearestRef = useRef<{ kind: "actor" | "clue" | "stairs"; id: string; name: string; p: Point } | null>(null);
  playerRef.current = player;
  onInteractRef.current = onInteract;

  const nearest = useMemo(() => {
    const available = [
      ...actors.filter((a) => a.floor === floor).map((a) => ({ kind: "actor" as const, id: a.id, name: a.name, p: a })),
      ...clues.filter((c) => c.floor === floor && !found.includes(c.id)).map((c) => ({ kind: "clue" as const, id: c.id, name: lang === "zh" ? c.name : clueEn[c.id].name, p: c })),
      { kind: "stairs" as const, id: "stairs", name: floor === 1 ? ui[lang].up : ui[lang].down, p: { x: 470, y: 505 } },
    ].sort((a, b) => dist(player, a.p) - dist(player, b.p));
    return nearestOrNull(available, player);
  }, [floor, player, found, lang]);
  nearestRef.current = nearest;

  const interact = useCallback(() => {
    if (nearest) onInteract(nearest.kind, nearest.id);
  }, [nearest, onInteract]);

  const handleCanvasClick = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = {
      x: ((e.clientX - rect.left) / rect.width) * MAP_W,
      y: ((e.clientY - rect.top) / rect.height) * MAP_H,
    };
    const targets = [
      ...actors.filter((a) => a.floor === floor).map((a) => ({ kind: "actor" as const, id: a.id, p: a })),
      ...clues.filter((c) => c.floor === floor && !found.includes(c.id)).map((c) => ({ kind: "clue" as const, id: c.id, p: c })),
      { kind: "stairs" as const, id: "stairs", p: { x: 470, y: 485 } },
    ].sort((a, b) => dist(p, a.p) - dist(p, b.p));
    if (targets[0] && dist(p, targets[0].p) <= (targets[0].kind === "stairs" ? 72 : 38)) {
      onInteract(targets[0].kind, targets[0].id);
    }
  }, [floor, found, onInteract]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D"].includes(e.key)) {
        e.preventDefault();
        keys.current.add(e.key.toLowerCase());
      }
      const isInteractKey = e.code === "KeyE" || e.key.toLowerCase() === "e" || e.code === "Enter" || e.code === "Space";
      const target = nearestRef.current;
      if (isInteractKey && target) {
        e.preventDefault();
        e.stopPropagation();
        onInteractRef.current(target.kind, target.id);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    document.addEventListener("keydown", down, true);
    document.addEventListener("keyup", up, true);
    return () => {
      document.removeEventListener("keydown", down, true);
      document.removeEventListener("keyup", up, true);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(32, now - prev) / 16.67;
      prev = now;
      let dx = 0;
      let dy = 0;
      if (keys.current.has("w") || keys.current.has("arrowup")) dy -= 1;
      if (keys.current.has("s") || keys.current.has("arrowdown")) dy += 1;
      if (keys.current.has("a") || keys.current.has("arrowleft")) dx -= 1;
      if (keys.current.has("d") || keys.current.has("arrowright")) dx += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        const next = {
          x: Math.max(38, Math.min(MAP_W - 38, playerRef.current.x + (dx / len) * 4.2 * dt)),
          y: Math.max(66, Math.min(MAP_H - 30, playerRef.current.y + (dy / len) * 4.2 * dt)),
        };
        playerRef.current = next;
        setPlayer(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [setPlayer]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_W * dpr;
    canvas.height = MAP_H * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#141211";
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    if (floor === 1) {
      drawRoom(ctx, 45, 80, 270, 190, lang === "zh" ? "客厅 LIVING ROOM" : "LIVING ROOM");
      drawRoom(ctx, 335, 80, 220, 190, lang === "zh" ? "餐厅 DINING ROOM" : "DINING ROOM");
      drawRoom(ctx, 575, 80, 335, 190, lang === "zh" ? "厨房 KITCHEN" : "KITCHEN");
      drawRoom(ctx, 45, 290, 270, 230, lang === "zh" ? "门厅 FOYER" : "FOYER");
      drawRoom(ctx, 335, 290, 220, 230, lang === "zh" ? "主楼梯 GRAND STAIR" : "GRAND STAIR");
      drawRoom(ctx, 575, 290, 335, 230, lang === "zh" ? "管家室 / 洗衣房" : "MONITOR / LAUNDRY");
    } else {
      drawRoom(ctx, 45, 80, 250, 190, lang === "zh" ? "客房 GUEST ROOM" : "GUEST ROOM");
      drawRoom(ctx, 315, 80, 240, 400, lang === "zh" ? "二楼走廊 UPPER HALL" : "UPPER HALL");
      drawRoom(ctx, 575, 80, 335, 260, lang === "zh" ? "主卧 MASTER BEDROOM" : "MASTER BEDROOM");
      drawRoom(ctx, 575, 360, 160, 160, lang === "zh" ? "主卫" : "BATHROOM");
      drawRoom(ctx, 750, 360, 160, 160, lang === "zh" ? "杂物间" : "STORAGE");
    }

    ctx.fillStyle = "rgba(255,255,255,.025)";
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 83) % MAP_W, (i * 47) % MAP_H, 1, 18);

    actors.filter((a) => a.floor === floor).forEach((a) => {
      ctx.beginPath();
      ctx.arc(a.x, a.y, 17, 0, Math.PI * 2);
      ctx.fillStyle = a.color;
      ctx.fill();
      ctx.strokeStyle = "#e6d3af";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#f2e7d1";
      ctx.font = "600 13px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(a.name, a.x, a.y - 26);
    });

    clues.filter((c) => c.floor === floor && !found.includes(c.id)).forEach((c) => {
      const pulse = 6 + Math.sin(Date.now() / 300) * 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = "#d2a24e";
      ctx.fill();
      ctx.strokeStyle = "rgba(242,204,126,.5)";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = "#e0c58f";
      ctx.font = "600 11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${ui[lang].evidence} · ${lang === "zh" ? c.name : clueEn[c.id].name}`, c.x + 13, c.y + 4);
    });

    ctx.fillStyle = "rgba(197,155,82,.18)";
    ctx.fillRect(420, 452, 100, 68);
    ctx.strokeStyle = "#c59b52";
    ctx.lineWidth = 2;
    ctx.strokeRect(420, 452, 100, 68);
    ctx.fillStyle = "#e9dfce";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(floor === 1 ? "⇧" : "⇩", 470, 480);
    ctx.font = "600 12px sans-serif";
    ctx.fillText(floor === 1 ? ui[lang].up : ui[lang].down, 470, 505);

    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_R, 0, Math.PI * 2);
    ctx.fillStyle = "#efe2c9";
    ctx.fill();
    ctx.strokeStyle = "#b93632";
    ctx.lineWidth = 4;
    ctx.stroke();

    const vignette = ctx.createRadialGradient(player.x, player.y, 80, player.x, player.y, 390);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.45)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
  }, [floor, player, found, lang]);

  return (
    <div className="map-shell">
      <canvas ref={canvasRef} onPointerDown={handleCanvasClick} className="mansion-map" aria-label={lang === "zh" ? `别墅${floor}楼探索地图` : `Villa floor ${floor} exploration map`} />
      <div className="floor-label">{floor}F</div>
      <button className="floor-switch" onClick={() => onInteract("stairs", "stairs")}>{floor === 1 ? `⇧ ${ui[lang].up}` : `⇩ ${ui[lang].down}`}</button>
      <div className="map-help">{ui[lang].help}</div>
      {nearest && <button className="interaction-prompt" onClick={interact}><kbd>E</kbd> {nearest.id === "felix" ? ui[lang].inspectFelix : <>{nearest.kind === "actor" ? ui[lang].talkPrefix : ""}{nearest.name}{nearest.kind === "actor" ? ui[lang].talkSuffix : nearest.kind === "clue" ? ` ${ui[lang].investigate}` : ""}</>}</button>}
    </div>
  );
}

function nearestOrNull<T extends { p: Point }>(items: T[], player: Point): T | null {
  if (!items.length || dist(items[0].p, player) > 150) return null;
  return items[0];
}

function CharacterMemory({ characterId, lang, onComplete, onClose }: { characterId: string; lang: Lang; onComplete: () => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const memory = (lang === "zh" ? memoryScripts : memoryScriptsEn)[characterId];
  const current = memory.steps[step];
  const advance = () => {
    if (step === memory.steps.length - 1) onComplete();
    else setStep((s) => s + 1);
  };
  return (
    <div className="memory-screen" style={{ "--memory-tone": memory.tone } as React.CSSProperties}>
      <div className="memory-grain" />
      <button className="close-button" onClick={onClose}>{ui[lang].exitMemory}</button>
      <div className={`memory-scene memory-step-${step}`}>
        <p className="eyebrow">{memory.title}</p>
        <div className="memory-time">{current[0]}</div>
        <div className="memory-object" aria-hidden="true">{current[2]}</div>
        <p>{current[1]}</p>
        <div className="memory-dots" aria-label={lang === "zh" ? `记忆进度 ${step + 1}/${memory.steps.length}` : `Memory progress ${step + 1}/${memory.steps.length}`}>{memory.steps.map((_, i) => <span className={i <= step ? "active" : ""} key={i} />)}</div>
        <button className="primary-button" onClick={advance}>{current[3]}</button>
      </div>
    </div>
  );
}

function VictimPanel({ memoryDone, lang, onMemory, onClose }: { memoryDone: boolean; lang: Lang; onMemory: () => void; onClose: () => void }) {
  return (
    <div className="modal-backdrop victim-backdrop">
      <div className="victim-panel">
        <button className="close-button" onClick={onClose}>{lang === "zh" ? "返回主卧" : "Return to Bedroom"}</button>
        <p className="eyebrow">VICTIM · FELIX</p>
        <h2>{lang === "zh" ? "检查遗体" : "Examine the Body"}</h2>
        <p className="victim-summary">{lang === "zh" ? "Felix仰卧在床边。窗帘绳缠绕颈部，床头台灯已经关闭，牛奶杯仍放在伸手可及的位置。" : "Felix lies beside the bed with the curtain cord around his neck. The bedside lamp is off, and the milk cup remains within reach."}</p>
        <div className="victim-observations">
          <div><b>{lang === "zh" ? "颈部勒痕" : "Ligature Mark"}</b><span>{lang === "zh" ? "受力方向不符合独自操作留下的痕迹。" : "The direction of force is inconsistent with self-infliction."}</span></div>
          <div><b>{lang === "zh" ? "右手与报纸" : "Right Hand and Paper"}</b><span>{lang === "zh" ? "手指没有油墨摩擦，报纸平整地滑落在床侧。" : "There is no ink friction on his fingers. The paper lies flat beside the bed."}</span></div>
          <div><b>{lang === "zh" ? "意识残留" : "Residual Memory"}</b><span>{lang === "zh" ? "设备检测到失去意识前约十分钟的短期记忆。" : "The reader detects roughly ten minutes of memory before unconsciousness."}</span></div>
        </div>
        <button className="primary-button" onClick={onMemory}>{lang === "zh" ? (memoryDone ? "重看Felix的残留记忆" : "读取Felix的残留记忆") : (memoryDone ? "Replay Felix's Residual Memory" : "Read Felix's Residual Memory")}</button>
      </div>
    </div>
  );
}

function CaseBoard({ found, talked, memoriesDone, lang, onClose, onVerdict }: { found: string[]; talked: string[]; memoriesDone: string[]; lang: Lang; onClose: () => void; onVerdict: (good: boolean) => void }) {
  const [drug, setDrug] = useState("");
  const [killer, setKiller] = useState("");
  const [trick, setTrick] = useState("");
  const enough = found.length >= 5 && talked.length >= 5 && memoriesDone.length >= 6;
  return (
    <div className="modal-backdrop">
      <div className="case-board">
        <button className="close-button dark" onClick={onClose}>{lang === "zh" ? "返回调查" : "Return to Investigation"}</button>
        <p className="eyebrow">{ui[lang].caseBoard}</p>
        <h2>{ui[lang].reconstruct}</h2>
        <div className="progress-line"><span style={{ width: `${Math.min(100, (found.length / clues.length) * 100)}%` }} /></div>
        <p className="board-status">{ui[lang].evidence} {found.length}/{clues.length} · {ui[lang].witnesses} {talked.length}/5 · {ui[lang].experienced} {memoriesDone.length}/6</p>
        <div className="evidence-grid">
          {clues.map((c) => { const cc = lang === "zh" ? c : clueEn[c.id]; return <div className={found.includes(c.id) ? "evidence-card found" : "evidence-card"} key={c.id}><b>{found.includes(c.id) ? cc.name : ui[lang].unknown}</b><span>{found.includes(c.id) ? cc.detail : ui[lang].keepExploring}</span></div>; })}
        </div>
        <div className="verdict-form">
          <label>{ui[lang].drugQuestion}<select value={drug} onChange={(e) => setDrug(e.target.value)}><option value="">{ui[lang].choose}</option>{["Amy", "Coco", "Dean", "Ben", "Ella"].map(n => <option key={n}>{n}</option>)}</select></label>
          <label>{ui[lang].killerQuestion}<select value={killer} onChange={(e) => setKiller(e.target.value)}><option value="">{ui[lang].choose}</option>{["Amy", "Coco", "Dean", "Ben", "Ella"].map(n => <option key={n}>{n}</option>)}</select></label>
          <label>{ui[lang].roomQuestion}<select value={trick} onChange={(e) => setTrick(e.target.value)}><option value="">{ui[lang].choose}</option><option value="lock">{ui[lang].autoLock}</option><option value="secret">{ui[lang].secret}</option><option value="inside">{ui[lang].inside}</option></select></label>
          <button disabled={!enough || !drug || !killer || !trick} className="primary-button" onClick={() => onVerdict(drug === "Amy" && killer === "Coco" && trick === "lock")}>{enough ? ui[lang].submit : ui[lang].needMore}</button>
        </div>
      </div>
    </div>
  );
}

export default function GameClient() {
  const [lang, setLang] = useState<Lang>("zh");
  const [started, setStarted] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [floor, setFloor] = useState<Floor>(1);
  const [player, setPlayerState] = useState<Point>({ x: 170, y: 410 });
  const [found, setFound] = useState<string[]>([]);
  const [talked, setTalked] = useState<string[]>([]);
  const [dialogueOpen, setDialogueOpen] = useState<{
    id: string;
    screen: "opening" | "hub" | "response";
    questionId?: string;
    lineIndex: number;
    asked: string[];
  } | null>(null);
  const [memoryOpen, setMemoryOpen] = useState<string | null>(null);
  const [victimOpen, setVictimOpen] = useState(false);
  const [memoriesDone, setMemoriesDone] = useState<string[]>([]);
  const [boardOpen, setBoardOpen] = useState(false);
  const [result, setResult] = useState<"good" | "bad" | null>(null);
  const [toast, setToast] = useState("");
  const [musicOn, setMusicOn] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  const startMusic = useCallback(() => {
    if (!musicRef.current) {
      const audio = new Audio(`${import.meta.env.BASE_URL}audio/villa-background.mp3`);
      audio.loop = true;
      audio.volume = 0.32;
      musicRef.current = audio;
    }
    void musicRef.current.play().then(() => setMusicOn(true)).catch(() => setMusicOn(false));
  }, []);

  const toggleMusic = useCallback(() => {
    if (!musicRef.current || musicRef.current.paused) startMusic();
    else { musicRef.current.pause(); setMusicOn(false); }
  }, [startMusic]);

  const setPlayer = useCallback((p: Point) => setPlayerState(p), []);

  useEffect(() => {
    const savedLang = localStorage.getItem("case07-lang");
    if (savedLang === "zh" || savedLang === "en") setLang(savedLang);
    const raw = localStorage.getItem("case07-save");
    if (!raw) return;
    try {
      const save = JSON.parse(raw);
      setFound(save.found || []);
      setTalked(save.talked || []);
      setMemoriesDone(Array.isArray(save.memoriesDone) ? save.memoriesDone : save.memoryDone ? ["ella"] : []);
    } catch { /* ignore invalid local save */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("case07-lang", lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  useEffect(() => {
    localStorage.setItem("case07-save", JSON.stringify({ found, talked, memoriesDone }));
  }, [found, talked, memoriesDone]);

  useEffect(() => () => { musicRef.current?.pause(); }, []);

  const restartGame = useCallback(() => {
    localStorage.removeItem("case07-save");
    setStarted(false);
    setProfilesOpen(false);
    setFloor(1);
    setPlayerState({ x: 170, y: 410 });
    setFound([]);
    setTalked([]);
    setDialogueOpen(null);
    setMemoryOpen(null);
    setVictimOpen(false);
    setMemoriesDone([]);
    setBoardOpen(false);
    setResult(null);
    setToast("");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const onInteract = useCallback((kind: "actor" | "clue" | "stairs", id: string) => {
    if (kind === "stairs") {
      setFloor((f) => f === 1 ? 2 : 1);
      setPlayerState({ x: 470, y: 475 });
      return;
    }
    if (kind === "actor") {
      if (id === "felix") {
        setVictimOpen(true);
        return;
      }
      setDialogueOpen({ id, screen: "opening", lineIndex: 0, asked: [] });
      setTalked((t) => t.includes(id) ? t : [...t, id]);
      return;
    }
    const clue = clues.find((c) => c.id === id);
    if (clue) {
      setFound((f) => f.includes(id) ? f : [...f, id]);
      setToast(`${ui[lang].found}${lang === "zh" ? clue.name : clueEn[clue.id].name}`);
    }
  }, [lang]);

  const dialogueData = lang === "zh" ? dialogue : dialogueEn;
  const activeSuspectDialogue = dialogueOpen ? dialogueData[dialogueOpen.id] : null;
  const activeQuestion = dialogueOpen?.questionId && activeSuspectDialogue
    ? activeSuspectDialogue.questions.find((q) => q.id === dialogueOpen.questionId) ?? null
    : null;
  const activeDialogue = dialogueOpen && activeSuspectDialogue
    ? dialogueOpen.screen === "opening"
      ? activeSuspectDialogue.opening
      : dialogueOpen.screen === "response" && activeQuestion
        ? activeQuestion.response[dialogueOpen.lineIndex]
        : null
    : null;
  const actor = dialogueOpen ? actors.find((a) => a.id === dialogueOpen.id) : null;

  // Clues not yet unlocked per clueRequirements simply aren't in the world
  // yet — same "Undiscovered" treatment they'd get anyway, no separate
  // locked/unlocked visual state needed for now.
  const availableClues = useMemo(
    () => clues.filter((c) => isClueAvailable(c.id, found, talked)),
    [found, talked],
  );

  if (!started && profilesOpen) {
    return (
      <main className="profiles-screen">
        <div className="rain" />
        <section className="profiles-file" aria-labelledby="profiles-title">
          <p className="eyebrow">CASE 07 · {ui[lang].profilesEyebrow}</p>
          <h1 id="profiles-title">{ui[lang].profilesTitle}</h1>
          <p className="profiles-intro">{ui[lang].profilesIntro}</p>
          <RelationshipProfiles lang={lang}/>
          <div className="profiles-actions">
            <button className="primary-button large" onClick={() => { startMusic(); setProfilesOpen(false); setStarted(true); }}>{ui[lang].enterAfterProfiles}</button>
          </div>
        </section>
      </main>
    );
  }

  if (!started) {
    return (
      <main className="title-screen">
        <div className="rain" />
        <div className="title-card">
          <p className="eyebrow">MEMORY DETECTIVE FILES · CASE 07</p>
          <h1>{ui[lang].title}</h1>
          <p className="title-en">MURDER AT THE OLD VILLA</p>
          <div className="case-summary">{ui[lang].summary}</div>
          <div className="title-language-choice" aria-label="Choose language / 选择语言">
            <span>选择语言 · CHOOSE LANGUAGE</span>
            <div><button className={lang === "zh" ? "active" : ""} onClick={() => setLang("zh")}>中文</button><button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>ENGLISH</button></div>
          </div>
          <button className="primary-button large" onClick={() => setProfilesOpen(true)}>{ui[lang].enter}</button>
          <div className="controls"><span className="arrow-keys" aria-label={lang === "zh" ? "上下左右方向键" : "Arrow keys"}><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span><span>{lang === "zh" ? "移动与转向 · 靠近目标按 E 或 Enter 互动" : "Move and turn · Press E or Enter near a target"}</span></div>
        </div>
      </main>
    );
  }

  return (
    <main className="game-screen">
      <header className="game-header">
        <div><p className="eyebrow">CASE 07</p><h1>{ui[lang].title}</h1></div>
        <div className="header-actions">
          <span>{ui[lang].evidence} {found.length}/{clues.length}</span>
          <span>{ui[lang].witnesses} {talked.length}/5</span>
          <span>{ui[lang].memories} {memoriesDone.length}/6</span>
          <button className="music-button" onClick={toggleMusic} aria-pressed={musicOn}>{musicOn ? (lang === "zh" ? "♫ 音乐开" : "♫ Music On") : (lang === "zh" ? "♫ 音乐关" : "♫ Music Off")}</button>
          <button className="restart-button" onClick={restartGame}>{ui[lang].restart}</button>
        </div>
      </header>
      <Mansion3D floor={floor} lang={lang} player={player} setPlayer={setPlayer} actors={actors} clues={availableClues} found={found} onInteract={onInteract} onOpenPeople={() => setProfilesOpen(true)} onOpenBoard={() => setBoardOpen(true)} peopleLabel={ui[lang].profilesButton} boardLabel={ui[lang].board} />
      <footer className="game-footer"><span>{ui[lang].investigator}</span><span className="footer-controls"><span className="arrow-keys" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></span>{lang === "zh" ? "移动与转向 · E 互动 · 楼层按钮切换楼层" : "Move and turn · E interact · Use the floor button"}</span></footer>

      {profilesOpen && (
        <div className="modal-backdrop profiles-modal" role="dialog" aria-modal="true" aria-labelledby="profiles-modal-title">
          <section className="profiles-file">
            <button className="close-button" onClick={() => setProfilesOpen(false)}>{ui[lang].closeProfiles}</button>
            <p className="eyebrow">CASE 07 · {ui[lang].profilesEyebrow}</p>
            <h1 id="profiles-modal-title">{ui[lang].profilesTitle}</h1>
            <p className="profiles-intro">{ui[lang].profilesIntro}</p>
            <RelationshipProfiles lang={lang}/>
          </section>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      {dialogueOpen && actor && activeSuspectDialogue && (
        <div className="dialogue-panel">
          <div className="portrait" style={{ background: actor.color }}>{actor.name.slice(0, 1)}</div>
          <div className="dialogue-copy">
            <p className="speaker">{actor.name} · {lang === "zh" ? actor.room : ({"餐厅":"Dining Room","客厅":"Living Room","管家室":"Monitor Room","厨房":"Kitchen","二楼走廊":"Upper Hall"}[actor.room] || actor.room)}</p>

            {dialogueOpen.screen === "opening" && (
              <>
                <p>{activeSuspectDialogue.opening.text}</p>
                <div className="dialogue-actions">
                  <button onClick={() => setDialogueOpen({ ...dialogueOpen, screen: "hub" })}>{ui[lang].askQuestion}</button>
                </div>
              </>
            )}

            {dialogueOpen.screen === "hub" && (
              <>
                <p className="dialogue-prompt">{ui[lang].askQuestion}</p>
                <div className="question-list">
                  {activeSuspectDialogue.questions.map((q) => {
                    const wasAsked = dialogueOpen.asked.includes(q.id);
                    return (
                      <button
                        key={q.id}
                        className={wasAsked ? "question-button asked" : "question-button"}
                        onClick={() => setDialogueOpen({ ...dialogueOpen, screen: "response", questionId: q.id, lineIndex: 0 })}
                      >
                        {q.prompt}{wasAsked && <span className="asked-tag">{ui[lang].asked}</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="dialogue-actions">
                  {dialogueOpen.asked.length > 0 && (
                    <button className="memory-button" onClick={() => { const id = dialogueOpen.id; setDialogueOpen(null); setMemoryOpen(id); }}>{memoriesDone.includes(dialogueOpen.id) ? ui[lang].replayMemory : ui[lang].enterMemory}{actor.name}{ui[lang].possessiveMemory}</button>
                  )}
                  <button onClick={() => setDialogueOpen(null)}>{ui[lang].endInterview}</button>
                </div>
              </>
            )}

            {dialogueOpen.screen === "response" && activeQuestion && activeDialogue && (
              <>
                <p>{activeDialogue.text}</p>
                {activeDialogue.follow && <p className="observation">{activeDialogue.follow}</p>}
                <div className="dialogue-actions">
                  {dialogueOpen.lineIndex < activeQuestion.response.length - 1
                    ? <button onClick={() => setDialogueOpen({ ...dialogueOpen, lineIndex: dialogueOpen.lineIndex + 1 })}>{ui[lang].continue}</button>
                    : <button onClick={() => setDialogueOpen({ ...dialogueOpen, screen: "hub", questionId: undefined, lineIndex: 0, asked: dialogueOpen.asked.includes(activeQuestion.id) ? dialogueOpen.asked : [...dialogueOpen.asked, activeQuestion.id] })}>{ui[lang].backToQuestions}</button>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {memoryOpen && <CharacterMemory characterId={memoryOpen} lang={lang} onClose={() => setMemoryOpen(null)} onComplete={() => { const id = memoryOpen; setMemoriesDone((m) => m.includes(id) ? m : [...m, id]); setMemoryOpen(null); setToast(`${actors.find((a) => a.id === id)?.name}${ui[lang].memoryRecorded}`); }} />}
      {victimOpen && <VictimPanel memoryDone={memoriesDone.includes("felix")} lang={lang} onClose={() => setVictimOpen(false)} onMemory={() => { setVictimOpen(false); setMemoryOpen("felix"); }} />}
      {boardOpen && <CaseBoard found={found} talked={talked} memoriesDone={memoriesDone} lang={lang} onClose={() => setBoardOpen(false)} onVerdict={(good) => { setBoardOpen(false); setResult(good ? "good" : "bad"); }} />}

      {result && (
        <div className="ending-screen">
          <p className="eyebrow">FINAL VERDICT</p>
          <h2>{result === "good" ? ui[lang].finalTruth : ui[lang].wrong}</h2>
          <p>{result === "good" ? ui[lang].goodEnding : ui[lang].badEnding}</p>
          <button className="primary-button" onClick={() => setResult(null)}>{result === "good" ? ui[lang].returnExplore : ui[lang].continueInvestigation}</button>
        </div>
      )}
    </main>
  );
}
