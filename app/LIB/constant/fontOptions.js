import { Typography } from "sud-ui";

const rawFontList = [
  // #region 프리텐다드
  { value: "PretendardThin", label: "프리텐다드 Thin" },
  { value: "PretendardExtraLight", label: "프리텐다드 ExtraLight" },
  { value: "PretendardLight", label: "프리텐다드 Light" },
  { value: "PretendardRegular", label: "프리텐다드 Regular" },
  { value: "PretendardMedium", label: "프리텐다드 Medium" },
  { value: "PretendardSemiBold", label: "프리텐다드 SemiBold" },
  { value: "PretendardBold", label: "프리텐다드 Bold" },
  { value: "PretendardExtraBold", label: "프리텐다드 ExtraBold" },
  { value: "PretendardBlack", label: "프리텐다드 Black" },
  // #endregion

  // #region GmarketSans
  { value: "GmarketSansTTFBold", label: "G마켓산스 Bold" },
  { value: "GmarketSansTTFLight", label: "G마켓산스 Light" },
  { value: "GmarketSansTTFMedium", label: "G마켓산스 Medium" },
  // #endregion

  // #region suit
  { value: "Suit-1", label: "SUIT Thin" },
  { value: "Suit-2", label: "SUIT ExtraLight" },
  { value: "Suit-3", label: "SUIT Light" },
  { value: "Suit-4", label: "SUIT Regular" },
  { value: "Suit-5", label: "SUIT Medium" },
  { value: "Suit-6", label: "SUIT SemiBold" },
  { value: "Suit-7", label: "SUIT ExtraBold" },
  { value: "Suit-8", label: "SUIT Heavy" },
  // #endregion

  // #region 페이퍼로지
  { value: "PaperoziThin", label: "페이퍼로지 Thin" },
  { value: "PaperoziExtraLight", label: "페이퍼로지 ExtraLight" },
  { value: "PaperoziLight", label: "페이퍼로지 Light" },
  { value: "PaperoziRegular", label: "페이퍼로지 Regular" },
  { value: "PaperoziMedium", label: "페이퍼로지 Medium" },
  { value: "PaperoziSemiBold", label: "페이퍼로지 SemiBold" },
  { value: "PaperoziBold", label: "페이퍼로지 Bold" },
  { value: "PaperoziExtraBold", label: "페이퍼로지 ExtraBold" },
  { value: "PaperoziBlack", label: "페이퍼로지 Black" },
  // #endregion

  // #region 에이투지체
  { value: "A2zThin", label: "에이투지체 Thin" },
  { value: "A2zExtraLight", label: "에이투지체 ExtraLight" },
  { value: "A2zLight", label: "에이투지체 Light" },
  { value: "A2zRegular", label: "에이투지체 Regular" },
  { value: "A2zMedium", label: "에이투지체 Medium" },
  { value: "A2zSemiBold", label: "에이투지체 SemiBold" },
  { value: "A2zBold", label: "에이투지체 Bold" },
  { value: "A2zExtraBold", label: "에이투지체 ExtraBold" },
  { value: "A2zBlack", label: "에이투지체 Black" },
  // #endregion

  // #region 본고딕 (Noto Sans KR)
  { value: "NotoSansKR-Black", label: "본고딕 Black" },
  { value: "NotoSansKR-ExtraBold", label: "본고딕 ExtraBold" },
  { value: "NotoSansKR-Bold", label: "본고딕 Bold" },
  { value: "NotoSansKR-SemiBold", label: "본고딕 SemiBold" },
  { value: "NotoSansKR-Medium", label: "본고딕 Medium" },
  { value: "NotoSansKR-Regular", label: "본고딕 Regular" },
  { value: "NotoSansKR-Light", label: "본고딕 Light" },
  { value: "NotoSansKR-ExtraLight", label: "본고딕 ExtraLight" },
  { value: "NotoSansKR-Thin", label: "본고딕 Thin" },
  // #endregion

  // #region 본명조 (Noto Serif KR)
  { value: "NotoSerifKR-Black", label: "본명조 Black" },
  { value: "NotoSerifKR-ExtraBold", label: "본명조 ExtraBold" },
  { value: "NotoSerifKR-Bold", label: "본명조 Bold" },
  { value: "NotoSerifKR-SemiBold", label: "본명조 SemiBold" },
  { value: "NotoSerifKR-Medium", label: "본명조 Medium" },
  { value: "NotoSerifKR-Regular", label: "본명조 Regular" },
  { value: "NotoSerifKR-Light", label: "본명조 Light" },
  { value: "NotoSerifKR-ExtraLight", label: "본명조 ExtraLight" },
  { value: "NotoSerifKR-Thin", label: "본명조 Thin" },
  // #endregion

  // #region 나눔스퀘어 (NanumSquare)
  { value: "NanumSquareExtraBold", label: "나눔스퀘어 ExtraBold" },
  { value: "NanumSquareBold", label: "나눔스퀘어 Bold" },
  { value: "NanumSquare", label: "나눔스퀘어 Regular" },
  { value: "NanumSquareLight", label: "나눔스퀘어 Light" },
  { value: "NanumSquareAcEB", label: "나눔스퀘어 Ac ExtraBold" },
  { value: "NanumSquareAcB", label: "나눔스퀘어 Ac Bold" },
  { value: "NanumSquareAcR", label: "나눔스퀘어 Ac Regular" },
  { value: "NanumSquareAcL", label: "나눔스퀘어 Ac Light" },
  // #endregion

  // #region 나눔고딕 (NanumGothic)
  { value: "NanumGothicExtraBold", label: "나눔고딕 ExtraBold" },
  { value: "NanumGothicBold", label: "나눔고딕 Bold" },
  { value: "NanumGothic", label: "나눔고딕 Regular" },
  { value: "NanumGothicLight", label: "나눔고딕 Light" },
  // #endregion

  // #region 나눔명조 (NanumMyeongjo)
  { value: "NanumMyeongjoExtraBold", label: "나눔명조 ExtraBold" },
  { value: "NanumMyeongjoBold", label: "나눔명조 Bold" },
  { value: "NanumMyeongjo", label: "나눔명조 Regular" },
  // #endregion

  // #region 나눔스퀘어 라운드 (NanumSquareRound)
  { value: "NanumSquareRoundEB", label: "나눔스퀘어 라운드 ExtraBold" },
  { value: "NanumSquareRoundB", label: "나눔스퀘어 라운드 Bold" },
  { value: "NanumSquareRound", label: "나눔스퀘어 라운드 Regular" },
  { value: "NanumSquareRoundL", label: "나눔스퀘어 라운드 Light" },
  // #endregion

  // #region 나눔브러쉬 (NanumBrush)
  { value: "NanumBrush", label: "나눔손글씨 붓" },
  { value: "NanumPen", label: "나눔손글씨 펜" },
  // #endregion

  // #region SUITE
  { value: "Sweet1", label: "SUITE Light" },
  { value: "Sweet2", label: "SUITE Regular" },
  { value: "Sweet3", label: "SUITE Medium" },
  { value: "Sweet4", label: "SUITE SemiBold" },
  { value: "Sweet5", label: "SUITE Bold" },
  { value: "Sweet6", label: "SUITE ExtraBold" },
  { value: "Sweet7", label: "SUITE Heavy" },
  // #endregion

  // #region 프리젠테이션 (Freesentation)
  { value: "Presentation-Black", label: "프리젠테이션 Black" },
  { value: "Presentation-ExtraBold", label: "프리젠테이션 ExtraBold" },
  { value: "Presentation-Bold", label: "프리젠테이션 Bold" },
  { value: "Presentation-SemiBold", label: "프리젠테이션 SemiBold" },
  { value: "Presentation-Medium", label: "프리젠테이션 Medium" },
  { value: "Presentation-Regular", label: "프리젠테이션 Regular" },
  { value: "Presentation-Light", label: "프리젠테이션 Light" },
  { value: "Presentation-ExtraLight", label: "프리젠테이션 ExtraLight" },
  { value: "Presentation-Thin", label: "프리젠테이션 Thin" },
  // #endregion

  // #region KERIS
  { value: "KerisKedyuche-Bold", label: "KERIS 에듀체 Bold" },
  { value: "KerisKedyuche-Regular", label: "KERIS 에듀체 Regular" },
  { value: "KerisBaeum-ExtraBold", label: "KERIS 배움체 ExtraBold" },
  { value: "KerisBaeum-Bold", label: "KERIS 배움체 Bold" },
  { value: "KerisBaeum-Regular", label: "KERIS 배움체 Regular" },
  { value: "KerisBaeum-Light", label: "KERIS 배움체 Light" },
  { value: "KerisKeduLine", label: "KERIS 에듀체 라인" },
  // #endregion

  // #region 카페24 (Cafe24)
  { value: "Cafe24Surround", label: "카페24 서라운드" },
  { value: "Cafe24SurroundAir", label: "카페24 서라운드 에어" },
  { value: "Cafe24ClassicType", label: "카페24 클래식타입" },
  { value: "Cafe24Gowoonbam", label: "카페24 고운밤" },
  { value: "Cafe24Anemone", label: "카페24 아네모네" },
  { value: "Cafe24AnemoneAir", label: "카페24 아네모네 에어" },
  { value: "Cafe24ShiningStar", label: "카페24 빛나는별" },
  { value: "Cafe24Danjeonghae", label: "카페24 단정해" },
  { value: "Cafe24Dangdanghae", label: "카페24 당당해" },
  { value: "Cafe24Simple", label: "카페24 심플해" },
  { value: "Cafe24ProUp", label: "카페24 프로업" },
  { value: "Cafe24ProSlim-Bold", label: "카페24 프로슬림 Bold" },
  { value: "Cafe24ProSlim-Regular", label: "카페24 프로슬림 Regular" },
  { value: "Cafe24ProSlim-Light", label: "카페24 프로슬림 Light" },
  { value: "Cafe24SuperMagic-Bold", label: "카페24 슈퍼매직 Bold" },
  { value: "Cafe24SuperMagic-Regular", label: "카페24 슈퍼매직 Regular" },
  // #endregion

  // #region MaruBuri
  { value: "MaruBuri-Bold", label: "마루부리 Bold" },
  { value: "MaruBuri-SemiBold", label: "마루부리 SemiBold" },
  { value: "MaruBuri-Regular", label: "마루부리 Regular" },
  { value: "MaruBuri-Light", label: "마루부리 Light" },
  { value: "MaruBuri-ExtraLight", label: "마루부리 ExtraLight" },
  // #endregion

  // #region  hs
  { value: "HsJandari", label: "HS잔다리체" },
  { value: "HsBombaram30100", label: "HS봄바람체 3.0 Thin" },
  { value: "HsBombaram30400", label: "HS봄바람체 3.0 Regular" },
  { value: "HsSantoki20", label: "HS산토끼체2.0" },
  { value: "HsSantoki", label: "HS산토끼체" },
  { value: "HsBombaram21", label: "HS봄바람체 2.1" },
  { value: "HsSaemaul", label: "HS새마을체" },
  { value: "HsFallThought20", label: "HS가을생각체2.0" },
  { value: "HsFallThought", label: "HS가을생각체" },
  { value: "HsWinterSnowflake20", label: "HS겨울눈꽃체2.0" },
  { value: "HsSummerWaterLight20", label: "HS여름물빛체2.0" },
  { value: "HsDukkeobi", label: "HS두꺼비체" },
  { value: "HsHouseRabbitBlack", label: "HS집토끼체 블랙" },
  { value: "HsSummerWaterLight", label: "HS여름물빛체" },
  { value: "HsWinterSnowFlower", label: "HS겨울눈꽃체" },
  { value: "HsGultokki", label: "HS굴토끼체" },
  { value: "HsJibtokiRound", label: "HS집토끼체 라운드" },
  { value: "HsYuji", label: "HS유지체" },
  { value: "NoonnuBasicGothic", label: "눈누 기초고딕" },
  // #endregion

  // #region Escoredream
  { value: "Escoredream-1", label: "에스코어드림 1 Thin" },
  { value: "Escoredream-2", label: "에스코어드림 2 ExtraLight" },
  { value: "Escoredream-3", label: "에스코어드림 3 Light" },
  { value: "Escoredream-4", label: "에스코어드림 4 Regular" },
  { value: "Escoredream-5", label: "에스코어드림 5 Medium" },
  { value: "Escoredream-6", label: "에스코어드림 6 Bold" },
  { value: "Escoredream-7", label: "에스코어드림 7 ExtraBold" },
  { value: "Escoredream-8", label: "에스코어드림 8 Heavy" },
  // #endregion

  // #region 조선
  { value: "JoseonGulim", label: "조선굴림" },
  { value: "JoseonPalace", label: "조선궁서" },
  { value: "JoseonGaneGothic", label: "조선가는고딕" },
  { value: "JoseonBoldGothic", label: "조선굵은고딕" },
  { value: "JoseonSolidGothic", label: "조선견고딕" },
  { value: "JoseonBoldMyongjo", label: "조선굵은명조" },
  { value: "ChosunIlboMyungjo", label: "조선일보명조" },
  { value: "JoseonShinmyeongjo", label: "조선신명조" },
  { value: "JoseonLogo", label: "조선로고체" },
  { value: "Joseon100Years", label: "조선100년체" },
  // #endregion

  // #region 학교안심
  { value: "HakgyoansimDunggeunmisoB", label: "학교안심 둥근미소 B" },
  { value: "HakgyoansimDunggeunmisoR", label: "학교안심 둥근미소 R" },
  { value: "SchoolSafetyPuzzleOutline", label: "학교안심 퍼즐 아웃라인" },
  { value: "SchoolSafetyPuzzleBlack", label: "학교안심 퍼즐 블랙" },
  { value: "SchoolSafeUniverse", label: "학교안심 우주" },
  { value: "SchoolSafetyRecorder", label: "학교안심 리코더" },
  { value: "SchoolSafeVaultingBox", label: "학교안심 뜀틀" },
  { value: "SchoolSafePlayground", label: "학교안심 운동장" },
  { value: "SchoolSafetyMustache", label: "학교안심 콧수염" },
  { value: "SchoolSafetyHalfMoon", label: "학교안심 반달" },
  { value: "SchoolSafeLunchtime", label: "학교안심 점심시간" },
  { value: "SchoolSafetyMilkyWay", label: "학교안심 은하수" },
  { value: "SchoolSafetyRelay", label: "학교안심 이어달리기" },
  // #endregion

  // #region 강원교육
  { value: "GangwonEducationModuche-Light", label: "강원교육모두체 Light" },
  { value: "GangwonEducationModuche-Bold", label: "강원교육모두체 Bold" },
  { value: "GangwonEducationTteontteon", label: "강원교육튼튼체" },
  { value: "GangwonEducationSaeum", label: "강원교육새음체" },
  { value: "GangwonEducationHyunokSam", label: "강원교육현옥샘체" },
  // #endregion

  // #region 한컴 & 함초롬
  { value: "HancomSans-SemiBold", label: "한컴 산스 SemiBold" },
  { value: "HancomSans-Light", label: "한컴 산스 Light" },
  { value: "HancomHunmin", label: "한컴 훈민정음" },
  { value: "HancomMalrang-Bold", label: "한컴 말랑말랑 Bold" },
  { value: "HancomMalrang-Regular", label: "한컴 말랑말랑 Regular" },
  { value: "HamchoromDotum", label: "함초롬 돋움" },
  { value: "HamchoromBatang-Bold", label: "함초롬 바탕 Bold" },
  { value: "HamchoromBatang-Regular", label: "함초롬 바탕 Regular" },
  // #endregion

  // #region 갈무리 (Galmuri) - 별칭 버전
  { value: "Galmuri14", label: "갈무리 14" },
  { value: "Galmuri11-Bold", label: "갈무리 11 Bold" },
  { value: "Galmuri11-Regular", label: "갈무리 11 Regular" },
  { value: "Galmuri11-Condensed", label: "갈무리 11 Condensed" },
  { value: "Galmuri9", label: "갈무리 9" },
  { value: "Galmuri7", label: "갈무리 7" },
  { value: "GalmuriMono11", label: "갈무리 Mono 11" },
  { value: "GalmuriMono9", label: "갈무리 Mono 9" },
  { value: "GalmuriMono7", label: "갈무리 Mono 7" },
  // #endregion

  // #region 상주시 (Sangju)
  { value: "SangjuGyeongcheonseom", label: "상주경천섬체" },
  { value: "SangjuDajeongdagam", label: "상주다정다감체" },
  { value: "SangjuHaerebon", label: "상주해례본체" },
  { value: "SangjuGotgam", label: "상주곶감체" },
  // #endregion

  // #region 망고보드 시리즈
  { value: "MangoBoardTtobaks-Bold", label: "망고보드 또박체 Bold" },
  { value: "MangoBoardTtobaks-Regular", label: "망고보드 또박체 Regular" },
  { value: "MangoBoardTtobaks-Light", label: "망고보드 또박체 Light" },
  { value: "MangoBoardByeolbyeol", label: "망고보드 별별체" },
  // #endregion

  // #region 고운 시리즈
  { value: "GowunBatang-Bold", label: "고운바탕 Bold" },
  { value: "GowunBatang-Regular", label: "고운바탕 Regular" },
  { value: "GowoonDodum", label: "고운돋움" },
  // #endregion

  // #region 고양시 & 와글와글
  { value: "GoyangDeokyang", label: "고양덕양체" },
  { value: "GoyangIlsan", label: "고양일산체" },
  { value: "Goyang", label: "고양체" },
  { value: "WaggleWaggle", label: "와글와글체" },
  // #endregion

  // #region Godo (고도체)
  { value: "GodoRounded-Regular", label: "godo rounded R" },
  { value: "GodoRounded-Light", label: "godo rounded L" },
  // #endregion

  // #region EBS
  { value: "EbsHunminjeongeumSaeron", label: "EBS훈민정음새론체" },
  { value: "EbsHunminjeongeum", label: "EBS훈민정음" },
  { value: "EbsJushigyeong", label: "EBS주시경체" },
  // #endregion

  // #region 빙수 시리즈
  { value: "MangoBingsu", label: "망고빙수" },
  { value: "LemonBingsu", label: "레몬빙수" },
  // #endregion

  // #region 원스토어 모바일 (OneStore Mobile)
  { value: "OneStoreMobilePop", label: "원스토어 모바일POP체" },
  {
    value: "OneStoreMobileGothicTitleFont",
    label: "원스토어 모바일 고딕 제목체"
  },
  { value: "OneStoreMobileGothicBody", label: "원스토어 모바일 고딕 본문체" },
  // #endregion

  // #region 펴진고딕 (PyeojinGothic)
  { value: "PyeojinGothic-Bold", label: "펴진고딕 Bold" },
  { value: "PyeojinGothic-Regular", label: "펴진고딕 Regular" },
  { value: "PyeojinGothic-Light", label: "펴진고딕 Light" },
  // #endregion

  // #region Gothic A1
  { value: "GothicA1-Black", label: "Gothic A1 Black" },
  { value: "GothicA1-ExtraBold", label: "Gothic A1 ExtraBold" },
  { value: "GothicA1-Bold", label: "Gothic A1 Bold" },
  { value: "GothicA1-SemiBold", label: "Gothic A1 SemiBold" },
  { value: "GothicA1-Medium", label: "Gothic A1 Medium" },
  { value: "GothicA1-Regular", label: "Gothic A1 Regular" },
  { value: "GothicA1-Light", label: "Gothic A1 Light" },
  { value: "GothicA1-ExtraLight", label: "Gothic A1 ExtraLight" },
  { value: "GothicA1-Thin", label: "Gothic A1 Thin" },
  // #endregion

  // #region 둥근모 (Dunggeunmo) 시리즈
  { value: "NeoDunggeunGothicPro", label: "Neo둥근고딕Pro" },
  { value: "NeoDonggeunmo", label: "Neo둥근모" },
  { value: "RoundedFixedsys", label: "둥근모꼴+ Fixedsys" },
  // #endregion

  // #region Wanted Sans
  { value: "WantedSans-ExtraBlack", label: "Wanted Sans Extra Black" },
  { value: "WantedSans-Black", label: "Wanted Sans Black" },
  { value: "WantedSans-ExtraBold", label: "Wanted Sans ExtraBold" },
  { value: "WantedSans-Bold", label: "Wanted Sans Bold" },
  { value: "WantedSans-SemiBold", label: "Wanted Sans SemiBold" },
  { value: "WantedSans-Medium", label: "Wanted Sans Medium" },
  { value: "WantedSans-Regular", label: "Wanted Sans Regular" },
  // #endregion

  // #region 구름 산스 (Cloud Sans)
  { value: "CloudSans-Bold", label: "구름 산스 Bold" },
  { value: "CloudSans-Medium", label: "구름 산스 Medium" },
  { value: "CloudSans-Regular", label: "구름 산스 Regular" },
  { value: "CloudSansCode", label: "구름 산스 코드" },
  // #endregion

  // #region 동글 (Dongle)
  { value: "Dongle-Bold", label: "동글 Bold" },
  { value: "Dongle-Regular", label: "동글 Regular" },
  { value: "Dongle-Light", label: "동글 Light" },
  // #endregion

  // #region ACC 어린이체 시리즈
  { value: "AccChildrenSSkyClear", label: "ACC 어린이 하늘맑은체" },
  { value: "AccChildrenSKindHeart", label: "ACC 어린이 마음고운체" },
  { value: "AccChildrenSFall", label: "ACC 어린이 가을담은체" },
  // #endregion

  // #region 국민연금체 (NationalPension)
  { value: "NationalPension-ExtraBold", label: "국민연금체 ExtraBold" },
  { value: "NationalPension-Bold", label: "국민연금체 Bold" },
  { value: "NationalPension-Regular", label: "국민연금체 Regular" },
  // #endregion

  // #region 그리운 경찰관 (Nostalgic Police) 시리즈
  { value: "NostalgicPoliceVibe", label: "그리운 경찰감성체" },
  { value: "NostalgicPoliceFairness", label: "그리운 경찰공평체" },
  { value: "NostalgicPoliceHumanRights", label: "그리운 경찰인권체" },
  // #endregion

  // #region BC카드체 (BcCardFont)
  { value: "BcCardFont-Bold", label: "비씨카드 글꼴 Bold" },
  { value: "BcCardFont-Light", label: "비씨카드 글꼴 Light" },
  // #endregion

  // #region 영주시 (Yeongju) 시리즈
  { value: "YeongjuSeonbi", label: "영주선비체" },
  { value: "YeongjuPunggiGinseng", label: "영주풍기인삼체" },
  // #endregion

  // #region 정선아리랑 (Jeongseon Arirang) 시리즈
  { value: "JeongseonArirangRoot", label: "정선아리랑뿌리체" },
  { value: "JeongseonArirang", label: "정선아리랑체" },
  { value: "JeongseonArirangHon", label: "정선아리랑혼체" },
  // #endregion

  // #region 평택시 (Pyeongtaek) 시리즈
  { value: "PyeongtaekAnbo", label: "평택 안보체" },
  { value: "PyeongtaekSunset-Bold", label: "평택 노을체 Bold" },
  { value: "PyeongtaekSunset-Light", label: "평택 노을체 Light" },
  { value: "PyeongtaekSemiconductor-Bold", label: "평택 반도체 Bold" },
  { value: "PyeongtaekSemiconductor-Regular", label: "평택 반도체 Regular" },
  // #endregion

  // #region 포천시 (Pocheon) 시리즈
  { value: "PocheonMakgeolli", label: "포천 막걸리체" },
  { value: "PocheonOseongwaHanum", label: "포천 오성과 한음체" },
  // #endregion

  // #region 지자체 및 공공기관 ---
  { value: "Gimje", label: "김제시체" },
  { value: "Library", label: "도서관체" },
  { value: "MapoFlowerIsland", label: "마포꽃섬체" },
  { value: "ManhwaPromotionAgency", label: "만화진흥원체" },
  { value: "Yeongwol", label: "영월체" },
  { value: "ChangwonDangamRounded", label: "창원단감둥근체" },
  { value: "Manse", label: "만세체" },
  { value: "ChusaSarang-Bold", label: "추사 사랑체 Bold" },
  { value: "ChusaSarang-Regular", label: "추사 사랑체 Regular" },
  // #endregion

  // #region 기업 및 기타 감성 ---
  { value: "Ridibatang", label: "리디바탕" },
  { value: "Tmon", label: "티몬체" },
  { value: "SandollSamlipHobbangBasic", label: "산돌 삼립호빵체 Basic" },
  { value: "SandollSamlipHobbangOutline", label: "산돌 삼립호빵체 Outline" },
  { value: "Yanolja", label: "야놀자야체" },
  { value: "SfHambakneun", label: "SF함박눈" },
  { value: "GanaChocolate", label: "가나초콜릿체" },
  { value: "FlowerRoad", label: "꽃길" },
  { value: "SlowGothic", label: "느림보고딕" },
  { value: "Jeongmeokbawi", label: "정묵바위체" },
  { value: "Taenada", label: "태나다체" },
  { value: "Hangyore", label: "한겨레결체" },
  // #endregion

];

export const fontOptions = rawFontList.map((font) => ({
  ...font, // value와 label은 그대로 유지
  content: (
    <Typography
      size="sm"
      className="not-dockit-font"
      style={{
        fontFamily: font.value // value를 폰트명으로 사용
      }}
    >
      {font.label} {/* 'test' 대신 라벨을 보여주는 게 미리보기에 더 좋습니다 */}
    </Typography>
  )
}));
