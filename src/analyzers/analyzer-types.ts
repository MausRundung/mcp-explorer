export type AnalyzerOutput = {
  imports: string[];
  exports: string[];
  functions?: string[];
  moduleSpecifiers?: string[];
};

export type Analyzer = {
  extensions: string[];
  analyze: (filePath: string, content: string) => AnalyzerOutput;
};
