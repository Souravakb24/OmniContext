
| Algorithm 2                                                                                                                                                                                                                           | SELF-RAG Training data D = { X,Y } , generator M , C θ with a pre-trained LM { X sample ,Y sample } ∼ { X,Y } ▷ Training Critic LM(Section 3.2.1)   |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| 1: Input input-output 2: Initialize C 3: Sample data 4: for ( x, y ) ∈ ( X sample ,Y sample ) do 5: Prompt GPT-4 to collect a reflection token r for ( 6: Add { ( x, y, r ) } to D critic 7: Update C with next token prediction loss | ▷ Data collections for C x, y )                                                                                                                     |
| 8: Initialize M with a pre-trained LM 9: for ( x, y ) ∈ ( X,Y ) do 10: Run C to predict r given ( x, y ) 11: Add ( x, y, r ) to D gen 12: Update M on D gen with next token prediction loss                                           | ▷ Critic learning; Eq. 1 ▷ Training Generator LM(Section 3.2.2) ▷ Data collection for M with D critic ▷ Generator LM learning; Eq. 2                |


| Dataset name        | category              | Data source   |   the number of instances |
|---------------------|-----------------------|---------------|---------------------------|
| GPT-4 Alpaca        | Instruction-following | Open-Instruct |                    26,168 |
| Stanford Alpaca     | Instruction-following | Open-Instruct |                    25,153 |
| FLAN-V2             | Instruction-following | Open-Instruct |                    17,817 |
| ShareGPT            | Instruction-following | Open-Instruct |                    13,406 |
| Open Assistant 1    | Instruction-following | Open-Instruct |                     9,464 |
| Wizard of Wikipedia | Knowledge-intensive   | KILT          |                    17,367 |
| Natural Questions   | Knowledge-intensive   | KILT          |                    15,535 |
| FEVER               | Knowledge-intensive   | KILT          |                     9,966 |
| OpenBoookQA         | Knowledge-intensive   | HF Dataset    |                     4,699 |
| Arc-Easy            | Knowledge-intensive   | HF Dataset    |                     2,147 |
| ASQA                | Knowledge-intensive   | ASQA          |                     3,897 |


*Table 3: The generator LM M training data statistics.*


| base LM   |   Retrieve |   ISSUP |   ISREL |   ISUSE |
|-----------|------------|---------|---------|---------|
| Llama2-7B |       93.8 |    93.5 |    80.2 |    73.5 |
| FLAN-3B   |       85.6 |    73.1 |    82.0 |    72.1 |


*Figure 5: Reward prediction accuracy using GPT-4 predictions as ground-truth predictions.*


While our final model uses Llama2-7B as a base LM, we also train and compare FLAN-3B (Wei et al., 2022) model on the same data, to investigate the effectiveness of different data sizes affect final reward predictions. In most aspects, our reward model shows higher than 80% accuracy, indicating the powerful ability of fine-tuned specialized LMs to evaluate text. While both models show relatively lower performance on ISUSE , this is because both models often confuse between the two highest cases (5 and 4), where human annotators can also disagree.


Details of M data creation. Here, we provide detailed data creation procedures. Algorithm 3 summarizes the process. Here we set y t to y for simplification. Once we train the critic model, we first run it on input data from the aforementioned datasets, to predict whether retrieval is needed or not. For the instances where the critic predicts Retrieve = No , we only predict the ISUSE given input and output. For the instances where the critic predicts Retrieve = Yes , we first retrieve passages using the input and the entire output as queries, to find passages that are relevant to the entire output. We then split output sentences using Spacy. 7 For each sentence, we run C to predict whether the retrieval is necessary or not, given the input, preceding segments, and the initial retrieved passage. If C predicts Retrieve = No , then do not insert any paragraph at the t th segment. If C predicts Retrieve = Yes , then we use the original input and the t th segment as a retrieval query to find relevant passages for the t -th segment. For each retrieved passage, we predict ISREL and ISSUP . If there is any passage and continuation with ISREL = Relevant and ISSUP = Fully Supported / ISSUP = Partially Supported , then we sample it as the continuation. If there is more than one passage satisfying this criterion, we use the one with the highest retrieval score. If there are only ISREL = Irrelevant or ISSUP = No Support passages, we randomly sample one passage.


7 https://spacy.io/
