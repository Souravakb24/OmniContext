
![Chart type: Data visualization (includes table and line plots)](images/page_9_pic_1.png)


**Figure:** Figure 3
**Caption:** Figure 3: Analysis on SELF-RAG: (a) Ablation studies for key components of SELF-RAG training and inference based on our 7B model. (b) Effects of soft weights on ASQA citation precision and Mauve (fluency). (c) Retrieval frequency and normalized accuracy on PubHealth and PopQA.
**Description:**
Chart type: Data visualization (includes table and line plots)
Title: Subtitles: (a) Ablation, (b) Customization, (c) Retrieval
Axes: X — Weight for IsSupport (b), PopQA/Retrieval Threshold (c); Y — Precision/Mauve (b), Accuracy/Frequency (c)
Trend: Model performance metrics vary with experimental parameters (e.g., IsSupport weight in customization, retrieval thresholds in retrieval).
Key data points:
| Setting | PQA (acc) | Med (acc) | AS (em) |
|---------|-----------|-----------|---------|
| SELF-RAG (50k) | 45.5 | 73.5 | 32.1 |
| No Retriever $\mathcal{R}$ (Training) | 43.6 | 67.8 | 31.0 |
| No Critic $\mathcal{C}$ (Training) | 42.6 | 72.0 | 18.1 |
| No retrieval (Test) | 24.7 | 73.0 | — |
| Hard constraints (Test) | 28.3 | 72.6 | — |
| Retrieve top1 (Test) | 41.8 | 73.1 | 28.6 |
| Remove [SsUp] (Test) | 44.1 | 73.2 | 30.6 |


precisely grounded yet shorter outputs. Llama2-FT7B, which is the baseline LM trained on the same instruction-output pairs as SELF-RAG without retrieval or self-reflection and is retrieval-augmented at test time only, lags behind SELF-RAG. This result indicates SELF-RAG gains are not solely from training data and demonstrate the effectiveness of SELF-RAG framework.


## 5.2 ANALYSIS


Ablation studies. We conduct a set of ablations of our framework to identify which factors play key roles. We evaluate two model variants trained differently than our model: No Retriever trains an LM using the standard instruction-following method given instruction-output pairs, without retrieved passages; No Critic trains an LM trained with input-output pairs that are always augmented with the top one retrieved document without reflection tokens. This is similar to SAIL (Luo et al., 2023), and we use our instruction-output data instead of using the Alpaca dataset (Dubois et al., 2023), as in SAIL. We also conduct ablation on our inference-time algorithm, including No retrieval disables retrieval during inference; Hard constraints indicates the model performance that retrieves when Retrieve = Yes instead of using the adaptive threshold; Retrieve top 1 always retrieves and uses the top one document only, similar to standard RAG approaches; Remove ISSUP indicates the model performance that removes ISSUP score only during critique-guided beam search in Eq. 4. In this ablation experiment, we use a training instance size of 50k for a more efficient exploration of training variations. Later in this section, we conduct an analysis of the effect of training data size. We conduct the ablation studies on three datasets, PopQA, PubHealth, and ASQA. On ASQA, we evaluate models on sampled 150 instances and exclude ablations involving adaptive or no retrieval processes.


We show in Table 3a the ablation results. The top part of the table shows results for training ablations, and the bottom part is for inference ablations. We see that all components play important roles. We also observe a large performance gap between SELF-RAG and No Retriever or Critic baselines across tasks, indicating that training an LM with those models largely contributes to the performance gain of SELF-RAG. Using the top passages regardless of their relevance (Retrieve top 1) as in conventional RAG approaches causes a large drop in PopQA and ASQA, and removing ISSUP during the beam search results hurts performance on ASQA. This demonstrates the effectiveness of SELF-RAG's capabilities of carefully selecting generations based fine-grained multiple criterion, instead of naively using all of the top passages from the retrieval model or solely depending on relevance scores.


Effects of inference-time customization. One key benefit of our proposed framework is that it enables us to control how much each critique type affects the final generation sampling. We analyze the effects of different parameter weights on the top of our 7B model during inference time on ASQA, where multiple evaluation aspects are considered. Figure 3b shows the effects of changing the weighting term for ISSUP , which criticizes how supported the output is by the text passage. As the figure shows, increasing the weight leads to positive effects on the models' citation precision since this puts more emphasis on whether model generation is supported by the evidence. On the contrary, a larger weight results in lower MAUVE scores: when generation gets longer and more fluent, there are often more claims that are not fully supported by citations, consistent with findings by Liu et al. (2023a). Our framework lets practitioners choose and customize models' behaviors at test time by adjusting such parameters without requiring additional training.
