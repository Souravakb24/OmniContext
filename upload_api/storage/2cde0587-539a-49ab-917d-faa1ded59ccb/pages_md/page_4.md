
| Type     | Input    | Output                                                | Definitions                                                       |
|----------|----------|-------------------------------------------------------|-------------------------------------------------------------------|
| Retrieve | x / x, y | { yes, no, continue }                                 | Decides when to retrieve with R                                   |
| ISREL    | x,d      | { relevant , irrelevant }                             | d provides useful information to solve x .                        |
| ISSUP    | x, d, y  | { fully supported , partially supported, no support } | All of the verification-worthy statement in y is supported by d . |
| ISUSE    | x, y     | { 5 , 4, 3, 2, 1 }                                    | y is a useful response to x .                                     |


*Table 1: Four types of reflection tokens used in SELF-RAG. Each type uses several tokens to represent its output values. The bottom three rows are three types of Critique tokens, and the bold text indicates the most desirable critique tokens. x, y, d indicate input, output, and a relevant passage, respectively.*


## Algorithm 1 SELF-RAG Inference


```
Require: Generator LM M , Retriever R , Large-scale passage collections { d 1 , . . . , d N } 1: Input: input prompt x and preceding generation y <t , Output: next output segment y t 2: M predicts Retrieve given ( x, y <t ) 3: if Retrieve == Yes then 4: Retrieve relevant text passages D using R given ( x, y t -1 ) ▷ Retrieve 5: M predicts ISREL given x, d and y t given x, d, y <t for each d ∈ D ▷ Generate 6: M predicts ISSUP and ISUSE given x, y t , d for each d ∈ D ▷ Critique 7: Rank y t based on ISREL , ISSUP , ISUSE ▷ Detailed in Section 3.3 8: else if Retrieve == No then 9: M gen predicts y t given x ▷ Generate 10: M gen predicts ISUSE given x, y t ▷ Critique
```


Inference overview. Figure 1 and Algorithm 1 present an overview of SELF-RAG at inference. For every x and preceding generation y <t , the model decodes a retrieval token to evaluate the utility of retrieval. If retrieval is not required, the model predicts the next output segment, as it does in a standard LM. If retrieval is needed, the model generates: a critique token to evaluate the retrieved passage's relevance, the next response segment, and a critique token to evaluate if the information in the response segment is supported by the passage. Finally, a new critique token evaluates the overall utility of the response. 4 To generate each segment, SELF-RAG processes multiple passages in parallel and uses its own generated reflection tokens to enforce soft constraints (Section 3.3) or hard control (Algorithm 1) over the generated task output. For instance, in Figure 1 (right), the retrieved passages d 1 is selected at the first time step since d 2 does not provide direct evidence ( ISREL is Irrelevant) and d 3 output is only partially supported while d 1 are fully supported.


Training overview. SELF-RAG enables an arbitrary LM to generate text with reflection tokens by unifying them as next token predictions from the expanded model vocabulary (i.e., the original vocabulary plus reflection tokens). Specifically, we train the generator model M on a curated corpus with interleaving passages retrieved by a retriever R and reflection tokens predicted by a critic model C (summarized in Appendix Algorithm 2). We train C to generate reflection tokens for evaluating retrieved passages and the quality of a given task output (Section 3.2.1). Using the critic model, we update the training corpus by inserting reflection tokens into task outputs offline. Subsequently, we train the final generator model ( M ) using the conventional LM objective (Section 3.2.2) to enable M to generate reflection tokens by itself without relying on the critic at inference time.


## 3.2 SELF-RAG TRAINING


Here, we describe the supervised data collection and training of two models, the critic C (Section 3.2.1) and the generator M (Section 3.2.2).


## 3.2.1 TRAINING THE CRITIC MODEL


Data collection for critic model. Manual annotation of reflection tokens for each segment is expensive (Wu et al., 2023). A state-of-the-art LLM like GPT-4 (OpenAI, 2023) can be effectively


4 We follow Liu et al. (2023a) in using a 'perceived' utility value that is independent of retrieved passages.
