import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // test/ だけを見る。既定の `**/*.test.ts` は .data/ に構築した
    // japanese-addresses-v2 のテストまで拾い、こちらの結果が埋もれる
    include: ['test/**/*.test.ts'],
  },
})
