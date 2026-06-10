
Details of M data creation. Here, we provide detailed data creation procedures. Algorithm 3 summarizes the process. Here we set y t to y for simplification. Once we train the critic model, we first run it on input data from the aforementioned datasets, to predict whether retrieval is needed or not. For the instances where the critic predicts Retrieve = No , we only predict the ISUSE given input and output. For the instances where the critic predicts Retrieve = Yes , we first retrieve passages using the input and the entire output as queries, to find passages that are relevant to the entire output. We then split output sentences using Spacy. 7 For each sentence, we run C to predict whether the retrieval is necessary or not, given the input, preceding segments, and the initial retrieved passage. If C predicts Retrieve = No , then do not insert any paragraph at the t th segment. If C predicts Retrieve = Yes , then we use the original input and the t th segment as a retrieval query to find relevant passages for the t -th segment. For each retrieved passage, we predict ISREL and ISSUP . If there is any passage and continuation with ISREL = Relevant and ISSUP = Fully Supported / ISSUP = Partially Supported , then we sample it as the continuation. If there is more than one passage satisfying this criterion, we use the one with the highest retrieval score. If there are only ISREL = Irrelevant or ISSUP = No Support passages, we randomly sample one passage.


## Algorithm 3 M gen Data creation


```
1: Input Input-output data D = X,Y 2: for ( x, y ) ∈ { X,Y } do 3: Given ( x, y ) C predicts Retrieve 4: if Retrieve is predicted then 5: Retrieve relevant passages D using R given ( x, y ) ▷ Retrieve passages 6: for d ∈ D do 7: C predicts ISREL for each d ▷ Predict relevance of passages 8: C predicts ISSUP for each ( y, d ) ▷ Predict supports of outputs 9: C predicts ISUSE for each d ▷ Predict overall utility ( t = T only) 10: Sample d 11: else if Retrieve is not predicted then 12: C predicts ISUSE given x, y Add augmented ( x, y, d, r ) to D gen
```


Training examples. Table 4 show several training examples used for M training.


## A.3 SELF-RAG INFERENCE


Details of beam-search score calculations. We first compute scores for each critique type by taking the normalized probabilities of desirable tokens. For ISREL , we compute the score as follows:


$$
s ( \text {IsREL} ) = \frac { p ( \text {IsREL} ) = \text {RELVEANT} ) } { p ( \text {IsREL} ) = \text {RELVEANT} ) + p ( \text {IsREL} ) = \text {IRRELVEANT} ) } .
$$


For ISSUP , we compute the score as follows:


$$
s ( \text {IsReal} ) = \frac { p ( \text {IsSup} ) = \text {FULLY} ) } { S } + 0 . 5 \times \frac { p ( \text {IsSup} ) = \text {PARTIALLY} ) } { S } , \\
$$


where S = ∑ t ∈{ FULLY , PARTIALLY , NO } p ( ISSUP = t ) . For ISUSE where we have a five-scale score, we compute the weighted sum of the scores. We assigns weighted scores of w = {-1 , -0 . 5 , 0 , 0 . 5 , 1 } to the tokens ISUSE = { 1 , 2 , 3 , 4 , 5 } , and compute the final scores as follows:


$$
s ( [ \text {IsU} ] ) = \sum _ { i } ^ { 5 } w _ { i } \frac { p ( [ \text {IsU} ] = i ) } { S } ,
$$


$$
\boxed { \text {IsUse} } ) & = \sum _ { i } w _ { i } \frac { p ( \text {IsUse} = i ) } { S } , \\ = t ) .
$$


$$
\text {where } S = \sum _ { t \in \{ 1 , 2 , 3 , 4 , 5 \} } p ( \boxed { \text {IsUsc} } = t ) .
$$


Details of adaptive retrieval. For retrieval based on soft constraints, we trigger retrieval if the following condition is satisfied:


$$
\frac { p ( \text {Retrieve} = Y E S ) } { p ( \text {Retrieve} = Y E S ) + p ( p ( \text {Retrieve} = N O ) } > \delta .
$$


## B EXPERIMENTAL DETAILS


## B.1 MORE DETAILS OF TRAINING


More details of training and computations. We use 4 Nvidia A100 with 80GB memory to train our models. All models are trained for 3 epochs with a batch size of 128, a peak learning rate of 2e-5 with 3% warmup steps, and linear decay afterward. We set the maximum token length to be 2,048 for the 7B model, and 1,524 for the 13B model due to the memory constraint. We use Deepspeed stage 3 (Rajbhandari et al., 2020) to conduct multi-GPU distributed training, with training precision Bfloat16 enabled. FlashAttention (Dao et al., 2022) is used to make the long-context training more efficient. We run inference of our trained models using 1-2 Quadro RTX 6000 GPUs with 24GB memory.


$$
-
$$
