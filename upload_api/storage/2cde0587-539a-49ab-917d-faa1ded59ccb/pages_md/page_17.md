
## A SELF-RAG DETAILS


## A.1 REFLECTION TOKENS.


Definitions of reflection tokens. Below, we provide a detailed definition of reflection type and output tokens. The first three aspects will be provided at each segment level, while the final aspect is only given at each output level.

- Retrieval-on-demand ( Retrieve ): Given an input and previous-step generation (if applicable), an LM determines whether the continuation requires factual grounding. No indicates retrieval is unnecessary as the sequence does not require factual grounding or may not be enhanced by knowledge retrieval, Yes indicates retrieval is necessary. We additionally have continue to use evidence , which indicates that a model can continue to use the evidence retrieved previously. For instance, a passage may contain rich factual information, and thus SELF-RAG generates multiple segments based on the passage.
- Relevant ( ISREL ): Retrieved knowledge may not be always relevant to the input. This aspect indicates whether the evidence provides useful information ( Relevant ) or not ( Irrelevant ).
- Supported ( ISSUP ): Attribution is the concept of whether the output is fully supported by certain evidence (Menick et al., 2022; Bohnet et al., 2022). This aspect judges how much information in the output is entailed by the evidence. We evaluate attributions in three scale, Fully supported , Partially supported , and No support / Contradictory , following Yue et al. (2023); Nakano et al. (2021).
- Useful ( ISUSE ): Following the definitions from Liu et al. (2023a), we define the perceived utility as whether the response is a helpful and informative answer to the query, independently from whether it is in fact factual or not. This can be also viewed as plausibility in Menick et al. (2022). For usefulness, we use a five-scale evaluation (1 is the lowest and 5 is the highest).

Details of GPT-4-based data collections. We use the instruction and demonstration pairs to prompt GPT-4, listed in Section D. Following an official recommendation, we separate instructions and outputs with '##'. We use the temperature 1 and set the maximum output token counts to be 200. We discard instances where GPT-4 does not follow the designated output formats or output sequences that do not match our expected category names. As a result, we collected 1,2594 for Retrieve , 11,181 for ISSUP , 19,317 for relevance, 3,831 for utility.


Manual analysis of the GPT-4 predictions. The authors of this paper manually assess randomly sampled 20 instances for each aspect and check if GPT-4 predictions match their assessments given the same instruction, demonstrations, and test instances. We found our assessments show high agreement with GPT-4 predictions, especially for relevance (95%), retrieval necessity (95%), and the degree of support (90%). Agreement was slightly lower in usefulness (80%), mostly due to the disagreement between 1 and 2 or 4 and 5.


## A.2 SELF-RAG TRAINING


Overview of training. Algorithm 2 provides a high-level overview of our training.


Full list of seed datasets. To sample diverse input-output pairs, we sample instances of the OpenInstruct (Wang et al., 2023) dataset. In particular, we use their ShareGPT, GPT-4 Alpaca, Alpaca, OpenAssistant, and FLAN subsets subsets. We also sample instances from a couple of knowledgeintensive datasets, Natural Questions (Kwiatkowski et al., 2019), Wizard of Wikipedia (Dinan et al., 2019) and FEVER (Thorne et al., 2018) from the KILT benchmark (Petroni et al., 2021), ASQA (Stelmakh et al., 2022) and multiple QA datasets including ARC-Easy and OpenBookQA (Mihaylov et al., 2018). Table 3 shows the full list of training instances, and in total, we use 145,619 instances.


Performance of the Critic C . We evaluate the accuracy of reward predictions by splitting GPT-4 generated feedback into training, development, and test sets. The accuracy of the reward model is as follows. Table 5 shows the model performance of predicting GPT-4 judgments. As you can see, overall our fine-tuned reward model shows high prediction matching with GPT-4 predicted feedback.
