const { t: uiText } = require('./i18n.cjs');
const labels = {
  get reasoning() {
    return uiText('추론 중');
  },
  get agentMessage() {
    return uiText('답변 작성 중');
  },
  get message() {
    return uiText('답변 작성 중');
  },
  get plan() {
    return uiText('계획 작성 중');
  },
  get webSearch() {
    return uiText('웹 검색 중');
  },
  get web_search_call() {
    return uiText('웹 검색 중');
  },
  get imageGeneration() {
    return uiText('이미지 생성 중');
  },
  get image_generation_call() {
    return uiText('이미지 생성 중');
  },
  get mcpToolCall() {
    return uiText('도구 사용 중');
  },
  get dynamicToolCall() {
    return uiText('도구 사용 중');
  },
  get mcp_call() {
    return uiText('도구 사용 중');
  },
  get function_call() {
    return uiText('도구 사용 중');
  },
  get commandExecution() {
    return uiText('명령 실행 중');
  },
  get fileChange() {
    return uiText('파일 수정 중');
  },
  get file_search_call() {
    return uiText('자료 검색 중');
  },
  get code_interpreter_call() {
    return uiText('코드 실행 중');
  },
  get contextCompaction() {
    return uiText('대화 정리 중');
  }
};
class ChatActivity {
  constructor() {
    this.items = new Map();
    this.value = '응답 준비 중';
    this.hasText = false;
  }
  processing() {
    if (!this.items.size) this.value = this.hasText ? uiText('답변 작성 중') : uiText('응답 처리 중');
    return this.value;
  }
  start(id, type) {
    if (typeof id === 'string' && labels[type]) {
      this.items.set(id, labels[type]);
      this.value = labels[type];
    }
    return this.value;
  }
  finish(id) {
    if (this.items.delete(id))
      this.value = [...this.items.values()].at(-1) || (this.hasText ? uiText('답변 작성 중') : uiText('응답 처리 중'));
    return this.value;
  }
  writing() {
    this.hasText = true;
    return this.processing();
  }
  complete(status) {
    this.items.clear();
    this.value =
      status === 'completed'
        ? uiText('응답 완료')
        : status === 'cancelled'
          ? uiText('응답 중지됨')
          : uiText('응답 실패');
    return this.value;
  }
}
module.exports = { ChatActivity };
