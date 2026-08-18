# EvoX Agent 骞冲彴灞傛敼鍔ㄨ鏍?
> 鐩爣锛氬湪涓嶆敼鍙?Agent 妯″瀷鐨勫墠鎻愪笅锛岃 Agent 姣忚疆瀵硅瘽娑堣€楁洿灏?token锛?> 鍚屾椂鑾峰緱 Checkpoint銆丄uto-Verify銆丷epo Map 绛夋柊鑳藉姏銆?> 鎵€鏈夋敼鍔ㄦ槸"澧炲己鐜版湁宸ュ叿"鑰岄潪"鏂板宸ュ叿"锛屼笉鑶ㄨ儉 system prompt銆?
---

## 1. 鏂囦欢缂撳瓨灞?(Session File Cache)

### 鏀瑰姩浣嶇疆
`read` 宸ュ叿鐨勫疄鐜板眰

### 琛屼负
```
read(file_path) 绗竴娆?
  鈫?姝ｅ父杩斿洖鏂囦欢鍐呭
  鈫?骞冲彴璁板綍: { path, sha256, lineCount, timestamp }

read(file_path) 绗簩娆?(鏂囦欢鏈彉):
  鈫?杩斿洖: { cached: true, hash: "abc123", lines: 850 }
  鈫?0 token 鍐呭杈撳嚭锛?
read(file_path) 绗簩娆?(鏂囦欢宸插彉):
  鈫?鍙繑鍥炲彉鏇寸殑琛?+ 灏戦噺涓婁笅鏂?  鈫?{ changed: true, diff: [{ line: 45, old: "...", new: "..." }] }
```

### 缂撳瓨澶辨晥
- `edit` / `write` 鎿嶄綔鍚庤嚜鍔ㄥけ鏁堝搴旀枃浠剁紦瀛?- 浼氳瘽缁撴潫鑷姩娓呯┖鎵€鏈夌紦瀛?- 鏈€澶氱紦瀛?200 涓枃浠讹紝瓒呭嚭娣樻卑鏈€鏃х殑

### Token 鑺傜渷
- 閲嶅 read 鍚屼竴鏂囦欢锛氳妭鐪?62-100%
- 鍏稿瀷鍦烘櫙锛堢紪杈戔啋楠岃瘉鈫掑啀缂栬緫鈫掑啀楠岃瘉锛夛細鐪?4-6 娆″畬鏁?read

---

## 2. Checkpoint + 鑷姩鍥炴粴

### 鏀瑰姩浣嶇疆
`edit` 宸ュ叿澧炲己

### 鏂板鍙€夊弬鏁?```
edit(file_path, old_string, new_string, checkpoint?: boolean)
```

### 琛屼负
```
checkpoint=true (榛樿):
  step 1: 缂栬緫鍓嶈嚜鍔ㄥ浠藉師鏂囦欢
  step 2: 鎵ц鏇挎崲
  step 3: 杩斿洖鏃舵惡甯?checkpoint_id
  step 4: 鍚庣画鍙?checkpoint_restore(id) 鎴?checkpoint_clean(id)

checkpoint=false:
  鐜版湁琛屼负锛屼笉鍋氬浠?```

### 鏂板杞婚噺宸ュ叿锛堝彲鍐呭祵鍒?edit 杩斿洖鍊硷級
```
checkpoint_restore(id) 鈫?鎭㈠鏂囦欢鍒扮紪杈戝墠鐘舵€?checkpoint_clean(id)   鈫?纭鏃犺锛屽垹闄ゅ浠?checkpoint_list()      鈫?鍒楀嚭褰撳墠浼氳瘽鎵€鏈?checkpoint
```

### 鑷姩娓呯悊
- 浼氳瘽缁撴潫鏃跺钩鍙拌嚜鍔ㄦ竻鐞嗘墍鏈?checkpoint
- 鏈€澶氫繚鐣?50 涓紝瓒呭嚭娣樻卑鏈€鏃х殑
- 鍗曚釜 checkpoint 瓒呰繃 1MB 涓嶅浠?
### Token 鑺傜渷
- 缂栬緫澶辫触鍥炴粴锛氱渷 75%锛堥伩鍏?read + 閲嶆柊 edit锛?- 瀹炵幇鑴氭湰: `.evox-agent/checkpoint.ps1`

---

## 3. Auto-Verify (缂栬緫鍚庤嚜鍔ㄩ獙璇?

### 鏀瑰姩浣嶇疆
`edit` 宸ュ叿澧炲己

### 鏂板鍙€夊弬鏁?```
edit(file_path, old_string, new_string, auto_verify?: {
  lint?: boolean,
  test?: boolean,
  test_command?: string
})
```

### 琛屼负
```
auto_verify.lint=true:
  鈫?缂栬緫瀹屾垚鍚庡钩鍙拌嚜鍔ㄨ窇 lint
  鈫?鎴愬姛: 闈欓粯锛屼笉杩斿洖浠讳綍淇℃伅锛? token锛?  鈫?澶辫触: 鍙繑鍥炲け璐ユ憳瑕侊紙鏈€澶?5 鏉￠敊璇級

auto_verify.test=true:
  鈫?骞冲彴鑷姩妫€娴嬮」鐩祴璇曟鏋?  鈫?鎵惧埌瀵瑰簲娴嬭瘯鏂囦欢 鈫?杩愯
  鈫?鎴愬姛: 闈欓粯
  鈫?澶辫触: 鍙繑鍥炲け璐ョ敤渚嬪悕 + 琛屽彿

auto_verify.test_command="npm test -- --reporter=dot":
  鈫?浣跨敤鑷畾涔夊懡浠?```

### 鍏抽敭璁捐
- **涓嶈嚜鍔ㄤ慨澶?*锛屽彧鎶ュ憡澶辫触銆備慨澶嶇敱 Agent 鍐冲畾
- 瓒呮椂 30 绉掞紝闃叉闃诲
- 鍚庡彴杩愯锛屼笉闃诲 Agent 鐨勫叾浠栨搷浣?
### Token 鑺傜渷
- 鍏ㄩ€氳繃锛氳妭鐪?100%锛堢幇鐘惰鎵嬪姩璺戞祴璇曢獙璇侊級
- 鏈夊け璐ワ細鑺傜渷 80%锛堢簿鍑嗘姤鍛?vs 鍏ㄩ噺杈撳嚭锛?- 瀹炵幇鑴氭湰: `.evox-agent/auto-verify.ps1`

---

## 4. Repository Map (浠撳簱鍦板浘)

### 鏀瑰姩浣嶇疆
鏂板伐鍏?`repo_map`锛堟垨浣滀负 `glob` 鐨勫寮烘ā寮忥級

### 鎺ュ彛
```
repo_map(path?, depth?, include_symbols?, include_git?)
```

### 杩斿洖
```
{
  "tree": {
    "src/": {
      "agent/": {
        "core.ts": { "exports": ["Agent", "run"], "size": 850 },
        "tools.ts": { "exports": ["ToolRegistry"], "size": 320 }
      }
    }
  },
  "config": { "type": "typescript", "deps": 45, "devDeps": 23 },
  "git": { "branch": "main", "changed": 3, "recent": ["fix: ...", "feat: ..."] }
}
```

### 浣跨敤鍦烘櫙
- 鏇夸唬 `glob` + `grep` 鐨勬帰绱㈤樁娈?- 缁撴瀯鍖栬緭鍑猴紝Agent 涓€娆¤皟鐢ㄥ氨鑳界悊瑙ｉ」鐩叏璨?
### Token 鑺傜渷
- 鎺㈢储闃舵锛氫粠 5-10 杞?(3000-5000T) 鈫?1 杞?(200-500T)
- 鑺傜渷 70-90%
- 瀹炵幇鑴氭湰: `.evox-agent/repo-map.ps1`

---

## 5. Fuzzy 缂栬緫妯″紡

### 鏀瑰姩浣嶇疆
`edit` 宸ュ叿澧炲己

### 鏂板鍙€夊弬鏁?```
edit(file_path, old_string, new_string, fuzzy?: boolean)
```

### 琛屼负
```
fuzzy=false (榛樿):
  鐜版湁绮剧‘鍖归厤琛屼负

fuzzy=true:
  - 蹇界暐 old_string 姣忚鐨?trailing whitespace
  - 鍏佽 old_string 鍓嶅悗鍚勫 2 琛屽宸?  - 濡傛灉鍖归厤鍒板澶勶紝鎶ラ敊鏃跺垪鍑烘墍鏈夊尮閰嶄綅缃?```

### Token 鑺傜渷
- 绌虹櫧鍖归厤澶辫触锛氳妭鐪?75%锛堥伩鍏嶅け璐モ啋read鈫掗噸璇曞線杩旓級
- 涓嶅鍔犳柊宸ュ叿锛屼笉鑶ㄨ儉 prompt

---

## 6. 鏅鸿兘涓婁笅鏂囪鍓?
### 鏀瑰姩浣嶇疆
骞冲彴灞傚璇濈鐞?
### 瑙﹀彂鏉′欢
涓婁笅鏂囦娇鐢ㄨ秴杩?70%

### 琛屼负
```
鑷姩鍘嬬缉鏈€鏃?50% 鐨勫璇濊疆娆?

淇濈暀:
  - 鏈€杩?5 杞畬鏁村璇?  - 鎵€鏈?todo_write 璁板綍
  - 鎵€鏈?edit 鎿嶄綔鎽樿锛堟枃浠?+ 鏀瑰姩绠€杩帮級
  - 褰撳墠 goal 鎻忚堪

鍘嬬缉:
  - 涓棿杞鍘嬬缉涓? "[杞1-3] 鎺㈢储浜嗛」鐩粨鏋勶紝鍙戠幇鏍稿績妯″潡鍦?src/agent/"
  - 宸ュ叿璋冪敤缁嗚妭 鈫?涓€琛屾憳瑕?  - 閲嶅鐨?read 杈撳嚭 鈫?涓㈠純

Agent 鍙墜鍔ㄨЕ鍙?
  compact_context() 鈫?绔嬪嵆鍘嬬缉
```

### Token 鑺傜渷
- 100 杞暱瀵硅瘽锛氶噴鏀?~45% 涓婁笅鏂囩獥鍙?- 闂存帴浣嗗法澶х殑鑺傜渷鈥斺€旂浉褰撲簬绐楀彛鎵╁ぇ涓€鍊?
---

## 7. 宸ュ叿杈撳嚭鍘嬬缉

### 鏀瑰姩浣嶇疆
`grep` 鍜?`pwsh` 宸ュ叿澧炲己

### grep 鏂板鍙傛暟
```
grep(pattern, output?: "full" | "files" | "count" | "summary")
  files:   鍙繑鍥炴枃浠跺悕鍒楄〃
  count:   杩斿洖姣忎釜鏂囦欢鐨勫尮閰嶆暟
  summary: 杩斿洖鍖归厤琛屼絾鎴柇鍒?80 瀛楃
  full:    鐜版湁琛屼负锛堥粯璁わ紝淇濇寔鍏煎锛?```

### pwsh 鏂板鍙傛暟
```
pwsh(command, output?: "full" | "tail" | "summary" | "status")
  status:  鍙繑鍥為€€鍑虹爜
  tail:    鍙繑鍥炴渶鍚?50 琛?  summary: 杩斿洖閫€鍑虹爜 + 澶?10 琛?+ 灏?40 琛?+ 涓棿琛屾暟
  full:    鐜版湁琛屼负锛堥粯璁わ紝淇濇寔鍏煎锛?```

### Token 鑺傜渷
- grep 鎼滅储 TODO 杩斿洖 120 鏉?鈫?files 妯″紡 15 涓枃浠跺悕锛氳妭鐪?97%
- pwsh 璺戞祴璇?500 琛?鈫?summary 妯″紡 55 琛岋細鑺傜渷 89%
- 瀹炵幇鑴氭湰: `.evox-agent/output-compressor.ps1`

---

## 8. 棰勭疆椤圭洰涓婁笅鏂?
### 鏀瑰姩浣嶇疆
浼氳瘽鍒濆鍖?
### 琛屼负
```
浼氳瘽寮€濮嬫椂锛屽钩鍙拌嚜鍔ㄥ湪绗竴鏉℃秷鎭腑娉ㄥ叆:

1. 褰撳墠宸ヤ綔鐩綍 + 绠€鐣ユ枃浠舵爲锛? 灞傦級
2. Git 鐘舵€佹憳瑕侊紙鍒嗘敮銆佹湭鎻愪氦鏂囦欢鏁般€佹渶杩?3 鏉?commit锛?3. 椤圭洰绫诲瀷 + 鍏抽敭閰嶇疆锛坧ackage.json scripts / go.mod module锛?4. README 鍓?30 琛岋紙濡傛灉鏈夛級
5. 鏈€杩戠紪杈戠殑 10 涓枃浠?
鏍煎紡: 绱у噾 JSON锛岀害 200-500 tokens
```

### Token 鑺傜渷
- 鎺㈢储闃舵锛氫粠 5-10 杞?鈫?0 杞?- 鑺傜渷 100%
- 瀹炵幇鑴氭湰: `.evox-agent/context-injector.ps1`

---

## 9. 宸ュ叿鐑姞杞?
### 鏀瑰姩浣嶇疆
System prompt 鐢熸垚

### 琛屼负
```
鏍稿績宸ュ叿锛堝缁堝姞杞斤紝绾?60% 鐨勫伐鍏峰畾涔夛級:
  edit, read, write, pwsh, grep, glob, todo_write, ask_user_question

鎵╁睍宸ュ叿锛堟寜闇€鍔犺浇锛?
  - Agent 璇?"workflow" 鈫?娉ㄥ叆 workflow 宸ュ叿瀹氫箟
  - Agent 璇?"ralph" 鈫?娉ㄥ叆 ralph 宸ュ叿瀹氫箟
  - Agent 璇?"create_goal" 鈫?娉ㄥ叆 goal 宸ュ叿瀹氫箟

瑙﹀彂鏂瑰紡:
  - Agent 鍦ㄥ洖澶嶄腑棣栨浣跨敤鎵╁睍宸ュ叿鏃讹紝骞冲彴鍏堟敞鍏ュ畾涔夊啀鎵ц
  - 鎴栬€?Agent 鏄惧紡璋冪敤 skill("workflow") 鏉ュ姞杞?```

### Token 鑺傜渷
- System prompt 缂╁皬 ~30%
- 姣忔浼氳瘽鐪?500-1000T

---

## 10. 瀛?Agent 涓婁笅鏂囨ā寮?
### 鏀瑰姩浣嶇疆
`subagent` 鍜?`subagent_fork` 宸ュ叿

### 鏂板鍙€夊弬鏁?```
subagent(prompt, context?: "full" | "task_only" | "task+files")
  full:       鐜版湁琛屼负锛屼紶閫掑畬鏁村璇濆巻鍙?  task_only:  鍙紶閫掍换鍔℃弿杩帮紝涓嶄紶閫掑巻鍙?  task+files: 浼犻€掍换鍔℃弿杩?+ 鏈€杩?read 鐨勬枃浠跺唴瀹?```

### Token 鑺傜渷
- 瀛?agent 涓婁笅鏂囧崰婊￠棶棰橈細鑺傜渷 ~30% 瀛?agent 涓婁笅鏂?- 瀛?agent 鍚姩鏇村揩

---

## 11. Read 鑷姩鍒嗛〉

### 鏀瑰姩浣嶇疆
`read` 宸ュ叿澧炲己

### 鏂板鍙傛暟
```
read(file_path, mode?: "head" | "tail" | "range" | "full")
  head:  鍓?N 琛岋紙榛樿 2000锛?  tail:  鍚?N 琛?  range: 鎸囧畾琛岃寖鍥?[start, end]
  full:  鑷姩鍒嗛〉锛岃繑鍥炲叏閮ㄥ唴瀹癸紙鏈変笂闄愪繚鎶わ級
```

### 琛屼负
```
read(file_path)  // 榛樿 full 妯″紡
  鈫?鏂囦欢 鈮?5000 琛? 杩斿洖鍏ㄩ儴
  鈫?鏂囦欢 > 5000 琛? 杩斿洖鍓?2000 + 灏?500 + 缁熻淇℃伅
```

### Token 鑺傜渷
- 姣忔閬垮厤"璇诲墠 2000鈫掍笉澶熲啋鍐嶈 1800"鐨勫線杩?- 鑺傜渷 1 娆″伐鍏疯皟鐢?+ 鍙傛暟 token

---

## 12. Edit 鎵归噺妯″紡

### 鏀瑰姩浣嶇疆
`edit` 宸ュ叿澧炲己

### 鏂板鎺ュ彛
```
edit_batch([
  { file, old_string, new_string },
  { file, old_string, new_string },
  ...
], options?: {
  atomic?: boolean,     // 浠讳竴澶辫触鍒欏叏閮ㄥ洖婊?  auto_verify?: boolean, // 鍏ㄩ儴瀹屾垚鍚庣粺涓€楠岃瘉
  fuzzy?: boolean       // 鍏ㄥ眬 fuzzy 妯″紡
})
```

### 琛屼负
```
atomic=true:
  鈫?鎵€鏈夌紪杈戝墠鍏堝垱寤?checkpoint
  鈫?浠讳竴澶辫触 鈫?鍏ㄩ儴鍥炴粴
  鈫?鍏ㄩ儴鎴愬姛 鈫?缁熶竴楠岃瘉

auto_verify=true:
  鈫?鎵归噺缂栬緫瀹屾垚鍚庣粺涓€璺?lint/test
  鈫?鍙繑鍥炲け璐ユ憳瑕?```

### Token 鑺傜渷
- 3 娆?edit 鈫?1 娆?edit_batch锛氳妭鐪?2 娆″伐鍏疯皟鐢?- 3 娆￠獙璇?鈫?1 娆＄粺涓€楠岃瘉锛氳妭鐪?2 娆￠獙璇佽皟鐢?- 姣忔壒鑺傜渷 ~500-1000T

---

## 闄勫綍 A: 瀹炵幇浼樺厛绾?
| 浼樺厛绾?| 鏂规 | 瀹炵幇闅惧害 | Token 鑺傜渷 | 渚濊禆 |
|--------|------|---------|-----------|------|
| P0 | 棰勭疆椤圭洰涓婁笅鏂?| 浣?| 鏋侀珮 | 鏃?|
| P0 | 鏂囦欢缂撳瓨 | 涓?| 鏋侀珮 | 鏃?|
| P0 | 杈撳嚭鍘嬬缉 | 浣?| 楂?| 鏃?|
| P1 | Checkpoint | 涓?| 涓?| 鏂囦欢缂撳瓨 |
| P1 | Auto-Verify | 浣?| 涓?| 鏃?|
| P1 | Repo Map | 浣?| 楂?| 鏃?|
| P1 | Fuzzy 缂栬緫 | 浣?| 涓?| 鏃?|
| P2 | Read 鑷姩鍒嗛〉 | 浣?| 浣?| 鏃?|
| P2 | Edit 鎵归噺 | 涓?| 涓?| Checkpoint |
| P2 | 瀛?Agent 涓婁笅鏂?| 浣?| 涓?| 鏃?|
| P3 | 宸ュ叿鐑姞杞?| 涓?| 浣?| 鏃?|
| P3 | 涓婁笅鏂囪鍓?| 楂?| 楂?| 鏃?|

## 闄勫綍 B: 宸插疄鐜扮殑鑴氭湰

| 鑴氭湰 | 璺緞 | 鍔熻兘 |
|------|------|------|
| session-cache.ps1 | `.evox-agent/session-cache.ps1` | 鏂囦欢缂撳瓨 + 缂撳瓨澶辨晥 |
| checkpoint.ps1 | `.evox-agent/checkpoint.ps1` | 缂栬緫鍓嶅浠?+ 鍥炴粴 |
| auto-verify.ps1 | `.evox-agent/auto-verify.ps1` | 缂栬緫鍚庤嚜鍔?lint/test |
| repo-map.ps1 | `.evox-agent/repo-map.ps1` | 浠撳簱缁撴瀯鍦板浘 |
| output-compressor.ps1 | `.evox-agent/output-compressor.ps1` | grep/pwsh/read 杈撳嚭鍘嬬缉 |
| context-injector.ps1 | `.evox-agent/context-injector.ps1` | 浼氳瘽鍚姩涓婁笅鏂囨敞鍏?|
