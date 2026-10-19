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
