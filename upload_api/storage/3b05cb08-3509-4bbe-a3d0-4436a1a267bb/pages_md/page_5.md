
|             |   Faith. |   Ans. Rel. |   Cont. Rel. |
|-------------|----------|-------------|--------------|
| Ragas       |     0.95 |        0.78 |         0.70 |
| GPT Score   |     0.72 |        0.52 |         0.63 |
| GPT Ranking |     0.54 |        0.40 |         0.52 |


*Table 1: Agreement with human annotators in pairwise comparisons of faithfulness, answer relevance and context relevance, using the WikEval dataset (accuracy).*


answering the question. For the few pages without any back-links, we instead used ChatGPT to complete the given context.


## 5 Experiments


Table 1 analyses the agreement between the metrics proposed in Section 3 and the human assessments from the proposed WikiEval dataset. Each WikiEval instance requires the model to compare two answers or two context fragments. We count how often the answer/context preferred by the model (i.e. with highest estimated faithfulness, answer relevance, or context relevance) coincides with the answer/context preferred by the human annotators. We report the results in terms of accuracy (i.e. the fraction of instances on which the model agrees with the annotators).


To put the results in context, we compare our proposed metrics (shown as Ragas in Table 1) with two baseline methods. For the first method, shown as GPT Score , we ask ChatGPT to assign a score between 0 and 10 for the three quality dimensions. To this end, we use a prompt that describes the meaning of the quality metric and then asks to score the given answer/context in line with that definition. For instance, for evaluating faithfulness, we used the following prompt:


```
Faithfulness measures the information consistency of the answer against the given context. Any claims that are made in the answer that cannot be deduced from context should be penalized. Given an answer and context, assign a score for faithfulness in the range 0-10. context : [context] answer : [answer]
```


Ties, where the same score is assigned by the LLM to both answer candidates, were broken randomly. The second baseline, shown as GPT Ranking , instead asks ChatGPT to select the preferred answer/- context. In this case, the prompt again includes a definition of the considered quality metric. For instance, for evaluating answer relevance, we used the following prompt:


Ties, where the same score is assigned by the LLM to both answer candidates, were broken randomly. The second baseline, shown as GPT Ranking , instead asks ChatGPT to select the preferred answer/- context. In this case, the prompt again includes a definition of the considered quality metric. For instance, for evaluating answer relevance, we used the following prompt:


Answer Relevancy measures the degree to which a response directly addresses and is appropriate for a given question. It penalizes the present of redundant information or incomplete answers given a question. Given an question and answer, rank each answer based on Answer Relevancy.


question :


[question]


answer 1 :


[answer 1]


answer 2 : [answer 2]


The results in Table 1 show that our proposed metrics are much closer aligned with the human judgements than the predictions from the two baselines. For faithfulness, the Ragas prediction are in general highly accurate. For answer relevance, the agreement is lower, but this is largely due to the fact that the differences between the two candidate answers are often very subtle. We found context relevance to be the hardest quality dimension to evaluate. In particular, we observed that ChatGPT often struggles with the task of selecting the sentences from the context that are crucial, especially for longer contexts.


## 6 Conclusions


We have highlighted the need for automated reference-free evaluation of RAG systems. In particular, we have argued the need for an evaluation framework that can assess faithfulness (i.e. is the answer grounded in the retrieved context), answer relevance (i.e. does the answer address the question) and context relevance (i.e. is the retrieved context sufficiently focused). To support the development of such a framework, we have introduced WikiEval , a dataset which human judgements of these three different aspects. Finally, we have also described Ragas, our implementation of the three considered quality aspects. This framework is easy to use and can provide deverlopers of RAG systems with valuable insights, even in the absence of any ground truth. Our evaluation on WikiEval has shown that the predictions from Ragas are closely aligned with human predictions, especially for faithfulness and answer relevance.
