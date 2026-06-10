
![Blocks](images/page_7_pic_1.png)


**Figure:** Figure 4
**Caption:** Figure 4: Querying Process: Illustration of how RAPTOR retrieves information for two questions about the Cinderella story: 'What is the central theme of the story?' and 'How did Cinderella find a happy ending?'. Highlighted nodes indicate RAPTOR's selections, while arrows point to DPR's leaf nodes. Notably, RAPTOR's context often encompasses the information retrieved by DPR, either directly or within higher-layer summaries.
**Description:**
Blocks:
- 23, 24, 25, 26
- 16, 17, 18, 19, 20, 21, 22
- 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
Connections:
- 25 -> 16, 17, 18, 19 (RAPTOR retrieved for Question 2)
- 25 -> 11, 15 (DPR retrieved for Question 2)
- 23 -> 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 (RAPTOR retrieved for Question 1)
- 24 -> 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 (DPR retrieved for Question 1)
- 26 -> 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 (RAPTOR retrieved for Question 2)
- (Additional connections follow similar patterns across other upper nodes to lower nodes as seen in the diagram, with color-coded arrows indicating RAPTOR vs. DPR retrieval for Questions 1 and 2)
Summary: The image represents a flowchart illustrating a retrieval system with three hierarchical layers of numbered nodes (top: 23–26, middle: 16–22, bottom: 0–15), where inter-layer connections denote retrieval paths. Color-coded indicators (orange, purple, pink) distinguish which method (RAPTOR or DPR) retrieved specific nodes for two questions (Question 1 and Question 2), showing how different paths are used across the layers for each query.


our results demonstrate that RAPTOR, when combined with any retriever, consistently outperforms the respective retriever across all datasets. 2


Since RAPTOR with SBERT has the best performance, we use it in all subsequent experiments. We now compare RAPTOR with BM25 and DPR, using three different LLMs: GPT-3, GPT-4, and UnifiedQA. As shown in Table 3, RAPTOR consistently outperforms BM25 and DPR across all three Language Models on the QASPER dataset. RAPTOR's F-1 Match scores are 53.1%, 55.7%, and 36.6% when using GPT-3, GPT-4, and UnifiedQA, respectively. These scores surpass DPR by margins of 1.8, 2.7, and 4.5 points, and outdo BM25 by 6.5, 5.5, and 10.2 points across the respective LLMs. QASPER requires synthesizing information within NLP papers, so it is unsurprising that RAPTOR's higher-level summary nodes would allow it to outperform methods that can only extract the topk most similar raw chunks of text, which may not contain the correct response in isolation.


*Table 1: NarrativeQA Performance With + Without RAPTOR: Performance comparison of various retrieval methods (SBERT, BM25, DPR) with and without RAPTOR on the NarrativeQA dataset, using UnifiedQA-3B as the language model. RAPTOR outperforms baselines of each respective retrieval method.*


| Model                | ROUGE   | BLEU-1   | BLEU-4   | METEOR   |
|----------------------|---------|----------|----------|----------|
| SBERT with RAPTOR    | 30.87%  | 23.50%   | 6.42%    | 19.20%   |
| SBERT without RAPTOR | 29.26%  | 22.56%   | 5.95%    | 18.15%   |
| BM25 with RAPTOR     | 27.93%  | 21.17%   | 5.70%    | 17.03%   |
| BM25 without RAPTOR  | 23.52%  | 17.73%   | 4.65%    | 13.98%   |
| DPR with RAPTOR      | 30.94%  | 23.51%   | 6.45%    | 19.05%   |
| DPR without RAPTOR   | 29.56%  | 22.84%   | 6.12%    | 18.44%   |


Likewise, in the QuALITY dataset as shown in Table 4, RAPTOR achieves an accuracy of 62.4%, which is a 2% and 5.1% improvement over DPR and BM25. Similar trends are observed when UnifiedQA is employed, with RAPTOR outperforming DPR and BM25 by 2.7% and 6.7%, respectively.


Finally, in the NarrativeQA dataset, as presented in Table 6, RAPTOR excels across multiple metrics. For ROUGE-L, it surpasses BM25 and DPR by 7.3 and 2.7 points, respectively. In other metrics like BLEU-1, BLEU-4, and METEOR, RAPTOR outperforms BM25 and DPR by margins ranging from 1.7 to 5.8 and 0.7 to 2.1 points, respectively.


2 For the DPR experiments in Tables 1 and 2, we used the dpr-multiset-base model as opposed to dpr-single-nq-base which was used in rest of the experiments done earlier. This decision was based on the performance observed in Karpukhin et al. (2020), where dpr-multiset-base showed superior results.
