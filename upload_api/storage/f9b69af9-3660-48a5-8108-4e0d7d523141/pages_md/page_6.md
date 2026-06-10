
One drawback, however, of the collapsed tree approach is that it requires cosine similarity search to be performed on all nodes in the tree. However, this can be made more efficient with fast k -nearest neighbor libraries such as FAISS (Johnson et al., 2019).


![Chart type: Line graph](images/page_6_pic_1.png)


**Figure:** Figure 3
**Caption:** Figure 3: Comparison of querying methods. Results on 20 stories from the QASPER dataset using tree traversal with different top-k values, and collapsed tree with different context lengths. Collapsed tree with 2000 tokens produces the best results, so we use this querying strategy for our main results.
**Description:**
Chart type: Line graph
Title: 
Axes: X — Context Length, Y — F1
Trend: Both "Collapsed tree" and "Tree Traversal" lines show an initial rise in F1 as context length increases, peaking at around context length 2000 before both decline.
Key data points:
| Context Length | F1 |
|---|---|
| ~400 | ~42 |
| ~750 | ~50 |
| ~1200 | ~55 |
| ~1750 | ~56 |
| ~2000 | ~58 |
| ~2200 | ~57 |


in Figure 4, RAPTOR's tree-based retrieval allows it to choose nodes from different tree layers, matching the question's detail level. This approach often yields more relevant and comprehensive information for downstream tasks than DPR. For a detailed discussion and examples, including the text retrieved by both RAPTOR and DPR for specific questions, please refer to the appendix G.


## 4 EXPERIMENTS


Datasets We measure RAPTOR's performance across three question-answering datasets: NarrativeQA, QASPER, and QuALITY.


NarrativeQA is a dataset that comprises question-answer pairs based on the full texts of books and movie transcripts, totaling 1,572 documents (Koˇ cisk` y et al., 2018; Wu et al., 2021). The NarrativeQA-Story task requires a comprehensive understanding of the entire narrative in order to accurately answer its questions, thus testing the model's ability to comprehend longer texts in the literary domain. We measure performance on this dataset using the standard BLEU (B-1, B-4), ROUGE (R-L), and METEOR (M) metrics. Please see appendix H for more details on the NarrativeQA evaluation script used in our experiments.


The QASPER dataset includes 5,049 questions across 1,585 NLP papers, with each question probing for information embedded within the full text (Dasigi et al., 2021). The answer types in QASPER are categorized as Answerable/Unanswerable, Yes/No, Abstractive, and Extractive. Accuracy is measured using standard F1.


Lastly, the QuALITY dataset consists of multiple-choice questions, each accompanied by context passages averaging approximately 5,000 tokens in length (Pang et al., 2022). This dataset calls for reasoning over the entire document for QA tasks, enabling us to measure the performance of our retrieval system on medium-length documents. The dataset includes a challenging subset, QuALITYHARD, which contains questions that a majority of human annotators answered incorrectly in a speed-setting. We report accuracies for both the entire test set and the HARD subset.


Controlled Baseline Comparisons We first present controlled comparisons using the UnifiedQA 3B as the reader, with SBERT (Reimers & Gurevych, 2019), BM25 (Robertson et al., 1995; 2009), and DPR (Karpukhin et al., 2020) as the embedding models with and without the RAPTOR tree structure, on three datasets: QASPER, NarrativeQA, and QuALITY. As shown in Tables 1 and 2,


Overall, given the collapsed tree approach's greater flexibility and its superior performance on the subset of the QASPER dataset, this is the querying approach with which we proceed. Specifically, we use the collapsed tree with 2000 maximum tokens, which approximately equates to retrieving the top-20 nodes. Using a token-based approach ensures the context does not exceed model context constraints as token counts can vary across nodes. For experiments with the UnifiedQA model, we provide 400 tokens of context, as UnifiedQA has a max context length of 512 tokens. We provide the same amount of tokens of context to RAPTOR and to the baselines.


Qualitative Study We conduct a qualitative analysis to understand the benefits of RAPTOR's retrieval process compared to Dense Passage Retrieval (DPR) methods. Our study focuses on thematic, multi-hop questions using a 1500-word Cinderella fairytale. As illustrated
