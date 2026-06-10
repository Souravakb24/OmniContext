
Connections to prior work on learning with critique. Recent work incorporates additional critique (feedback) during training, e.g., RLHF (Ouyang et al. 2022) via PPO. While PPO relies on separate reward models during training, we compute critique offline and directly insert them into the training corpus, where the generator LM is trained with a standard LM objective. This significantly reduces training costs compared to PPO. Our work also relates to prior work that incorporates special tokens to control generation (Keskar et al., 2019; Lu et al., 2022; Korbak et al., 2023). Our SELF-RAG learns to generate special tokens to evaluate its own prediction after each generated segment, enabling the use of a soft re-ranking mechanism or hard constraints at inference (discussed next).


## 3.3 SELF-RAG INFERENCE


Generating reflection tokens to self-evaluate its own output makes SELF-RAG controllable during the inference phase, enabling it to tailor its behavior to diverse task requirements. For tasks demanding factual accuracy (Min et al., 2023), we aim for the model to retrieve passages more frequently to ensure that the output aligns closely with the available evidence. Conversely, in more open-ended tasks, like composing a personal experience essay, the emphasis shifts towards retrieving less and prioritizing the overall creativity or utility score. In this section, we describe approaches to enforce control to meet these distinct objectives during the inference process.


Adaptive retrieval with threshold. SELF-RAG dynamically decides when to retrieve text passages by predicting Retrieve . Alternatively, our framework allows a threshold to be set. Specifically, if the probability of generating the Retrieve = Yes token normalized over all output tokens in Retrieve surpasses a designated threshold, we trigger retrieval (details in Appendix Section A.3).


Tree-decoding with critique tokens. At each segment step t , when retrieval is required, based either on hard or soft conditions, R retrieves K passages, and the generator M processes each passage in parallel and outputs K different continuation candidates. We conduct a segment-level beam search (with the beam size= B ) to obtain the topB segment continuations at each timestamp t , and return the best sequence at the end of generation. The score of each segment y t with respect to passage d is updated with a critic score S that is the linear weighted sum of the normalized probability of each Critique token type. For each critique token group G (e.g., ISREL ), we denote its score at timestamp t as s G t , and we compute a segment score as follows:


$$
f ( y _ { t } , d , [ \text {Circuit} ] ) = p ( y _ { t } | x , d , y _ { < t } ) ) + \mathcal { S } ( [ \text {Circuit} ] ) , \text {where} \quad ( 3 )
$$


$$
\mathcal { S } ( \text {citique} ) = \sum _ { G \in \mathcal { G } } w ^ { G } s _ { t } ^ { G } \text { for } \mathcal { G } = \{ \text {result} , \text {isSup} , \text {isUse} \} , \quad \text { } ( 4 )
$$


where s G t = p t (ˆ r ) ∑ NG i =1 p t ( r i ) stands for the generation probability of the most desirable reflection token ˆ r (e.g., ISREL = Relevant ) for the critique token type G with N G distinct tokens (that represent different possible values for G ). The weights w G in Eq. 4 are hyperparameters that can be adjusted at inference time to enable customized behaviors at test time. For instance, to ensure that result y is mostly supported by evidence, we can set a weight term for the ISSUP score higher, while relatively lowering weights for other aspects. Alternatively, we could further enforce hard constraints during decoding using Critique . Instead of using a soft reward function in Eq. 4, we could explicitly filter out a segment continuation when the model generates an undesirable Critique token (e.g., ISSUP = No support ) . Balancing the trade-off between multiple preferences has been studied in RLHF (Touvron et al., 2023; Wu et al., 2023), which often requires training to change models' behaviors. SELF-RAG tailors an LM with no additional training.


## 4 EXPERIMENTS


## 4.1 TASKS AND DATASETS


We conduct evaluations of our SELF-RAG and diverse baselines on a range of downstream tasks, holistically evaluating outputs with metrics designed to assess overall correctness, factuality, and fluency. Throughout these experiments, we conduct zero-shot evaluations, where we provide instructions describing tasks without few-shot demonstrations (Wei et al., 2022; Sanh et al., 2022). Details of our experiments' settings, including test-time instructions, are available in the Appendix Section B.1.


Closed-set tasks include two datasets, i.e., a fact verification dataset about public health ( PubHealth ; Zhang et al. 2023) and a multiple-choice reasoning dataset created from scientific exams ( ARC- Challenge ; Clark et al. 2018). We use accuracy as an evaluation metric and report on the test set. We aggregate the answer probabilities of target classes for both of these datasets (Appendix Section B.2).
