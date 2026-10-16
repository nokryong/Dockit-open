const labels = {
  reasoning: "추론 중", agentMessage: "답변 작성 중", message: "답변 작성 중",
  plan: "계획 작성 중", webSearch: "웹 검색 중", web_search_call: "웹 검색 중",
  imageGeneration: "이미지 생성 중", image_generation_call: "이미지 생성 중",
  mcpToolCall: "도구 사용 중", dynamicToolCall: "도구 사용 중", mcp_call: "도구 사용 중", function_call: "도구 사용 중",
  commandExecution: "명령 실행 중", fileChange: "파일 수정 중",
  file_search_call: "자료 검색 중", code_interpreter_call: "코드 실행 중", contextCompaction: "대화 정리 중",
};
class ChatActivity {
  constructor() { this.items = new Map(); this.value = "응답 준비 중"; this.hasText = false; }
  processing() { if (!this.items.size) this.value = this.hasText ? "답변 작성 중" : "응답 처리 중"; return this.value; }
  start(id, type) {
    if (typeof id === "string" && labels[type]) { this.items.set(id, labels[type]); this.value = labels[type]; }
    return this.value;
  }
  finish(id) {
    if (this.items.delete(id)) this.value = [...this.items.values()].at(-1) || (this.hasText ? "답변 작성 중" : "응답 처리 중");
    return this.value;
  }
  writing() { this.hasText = true; return this.processing(); }
  complete(status) { this.items.clear(); this.value = status === "completed" ? "응답 완료" : status === "cancelled" ? "응답 중지됨" : "응답 실패"; return this.value; }
}
module.exports = { ChatActivity };
