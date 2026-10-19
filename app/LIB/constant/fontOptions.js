import { t as uiText } from "../i18n";
import { Typography } from "sud-ui";

const rawFontList = [
  // #region 프리텐다드
  { value: "PretendardThin", get label() { return uiText("프리텐다드 Thin"); } },
  { value: "PretendardExtraLight", get label() { return uiText("프리텐다드 ExtraLight"); } },
  { value: "PretendardLight", get label() { return uiText("프리텐다드 Light"); } },
  { value: "PretendardRegular", get label() { return uiText("프리텐다드 Regular"); } },
  { value: "PretendardMedium", get label() { return uiText("프리텐다드 Medium"); } },
  { value: "PretendardSemiBold", get label() { return uiText("프리텐다드 SemiBold"); } },
  { value: "PretendardBold", get label() { return uiText("프리텐다드 Bold"); } },
  { value: "PretendardExtraBold", get label() { return uiText("프리텐다드 ExtraBold"); } },
  { value: "PretendardBlack", get label() { return uiText("프리텐다드 Black"); } },
  // #endregion

  // #region GmarketSans
  { value: "GmarketSansTTFBold", get label() { return uiText("G마켓산스 Bold"); } },
  { value: "GmarketSansTTFLight", get label() { return uiText("G마켓산스 Light"); } },
  { value: "GmarketSansTTFMedium", get label() { return uiText("G마켓산스 Medium"); } },
  // #endregion

  // #region 본고딕 (Noto Sans KR)
  { value: "NotoSansKR-Black", get label() { return uiText("본고딕 Black"); } },
  { value: "NotoSansKR-ExtraBold", get label() { return uiText("본고딕 ExtraBold"); } },
  { value: "NotoSansKR-Bold", get label() { return uiText("본고딕 Bold"); } },
  { value: "NotoSansKR-SemiBold", get label() { return uiText("본고딕 SemiBold"); } },
  { value: "NotoSansKR-Medium", get label() { return uiText("본고딕 Medium"); } },
  { value: "NotoSansKR-Regular", get label() { return uiText("본고딕 Regular"); } },
  { value: "NotoSansKR-Light", get label() { return uiText("본고딕 Light"); } },
  { value: "NotoSansKR-ExtraLight", get label() { return uiText("본고딕 ExtraLight"); } },
  { value: "NotoSansKR-Thin", get label() { return uiText("본고딕 Thin"); } },
  // #endregion

  // #region 본명조 (Noto Serif KR)
  { value: "NotoSerifKR-Black", get label() { return uiText("본명조 Black"); } },
  { value: "NotoSerifKR-ExtraBold", get label() { return uiText("본명조 ExtraBold"); } },
  { value: "NotoSerifKR-Bold", get label() { return uiText("본명조 Bold"); } },
  { value: "NotoSerifKR-SemiBold", get label() { return uiText("본명조 SemiBold"); } },
  { value: "NotoSerifKR-Medium", get label() { return uiText("본명조 Medium"); } },
  { value: "NotoSerifKR-Regular", get label() { return uiText("본명조 Regular"); } },
  { value: "NotoSerifKR-Light", get label() { return uiText("본명조 Light"); } },
  { value: "NotoSerifKR-ExtraLight", get label() { return uiText("본명조 ExtraLight"); } },
  { value: "NotoSerifKR-Thin", get label() { return uiText("본명조 Thin"); } },
  // #endregion

  // #region 나눔스퀘어 (NanumSquare)
  { value: "NanumSquareExtraBold", get label() { return uiText("나눔스퀘어 ExtraBold"); } },
  { value: "NanumSquareBold", get label() { return uiText("나눔스퀘어 Bold"); } },
  { value: "NanumSquare", get label() { return uiText("나눔스퀘어 Regular"); } },
  { value: "NanumSquareLight", get label() { return uiText("나눔스퀘어 Light"); } },
  { value: "NanumSquareAcEB", get label() { return uiText("나눔스퀘어 Ac ExtraBold"); } },
  { value: "NanumSquareAcB", get label() { return uiText("나눔스퀘어 Ac Bold"); } },
  { value: "NanumSquareAcR", get label() { return uiText("나눔스퀘어 Ac Regular"); } },
  { value: "NanumSquareAcL", get label() { return uiText("나눔스퀘어 Ac Light"); } },
  // #endregion

  // #region 나눔고딕 (NanumGothic)
  { value: "NanumGothicExtraBold", get label() { return uiText("나눔고딕 ExtraBold"); } },
  { value: "NanumGothicBold", get label() { return uiText("나눔고딕 Bold"); } },
  { value: "NanumGothic", get label() { return uiText("나눔고딕 Regular"); } },
  { value: "NanumGothicLight", get label() { return uiText("나눔고딕 Light"); } },
  // #endregion

  // #region 나눔명조 (NanumMyeongjo)
  { value: "NanumMyeongjoExtraBold", get label() { return uiText("나눔명조 ExtraBold"); } },
  { value: "NanumMyeongjoBold", get label() { return uiText("나눔명조 Bold"); } },
  { value: "NanumMyeongjo", get label() { return uiText("나눔명조 Regular"); } },
  // #endregion

  // #region 나눔스퀘어 라운드 (NanumSquareRound)
  { value: "NanumSquareRoundEB", get label() { return uiText("나눔스퀘어 라운드 ExtraBold"); } },
  { value: "NanumSquareRoundB", get label() { return uiText("나눔스퀘어 라운드 Bold"); } },
  { value: "NanumSquareRound", get label() { return uiText("나눔스퀘어 라운드 Regular"); } },
  { value: "NanumSquareRoundL", get label() { return uiText("나눔스퀘어 라운드 Light"); } },
  // #endregion

  // #region 나눔브러쉬 (NanumBrush)
  { value: "NanumBrush", get label() { return uiText("나눔손글씨 붓"); } },
  { value: "NanumPen", get label() { return uiText("나눔손글씨 펜"); } },
  // #endregion


];

export const fontOptions = rawFontList.map((font) => ({
  value: font.value,
  get label() { return font.label; },
  get content() { return (
    <Typography
      size="sm"
      className="not-dockit-font"
      style={{
        fontFamily: font.value // value를 폰트명으로 사용
      }}
    >
      {font.label} {/* 'test' 대신 라벨을 보여주는 게 미리보기에 더 좋습니다 */}
    </Typography>
  ); }
}));
