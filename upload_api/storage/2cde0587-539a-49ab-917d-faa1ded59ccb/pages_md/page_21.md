
## C.2 HUMAN EVALUATION EXAMPLES


Table 6 shows examples with human evaluations on S&P and correctness of ISREL and ISSUP reflection tokens.


## C.3 QUALITATIVE EXAMPLES


Table 7 shows several examples predicted by our SELF-RAG (13B). The first example is the model output to an ASQA question. The first reference states that Emperor Constantine made Sunday a day of rest from labor, and further the second citation supports the fact that the official adoption of Sunday as a day of rest by Constantine in AD 321. In the second example, the model predicts Contradictory to the first output as the output says the person has served as the CEO since 2010, while the passage says he stepped down as CEO in 2015. Indicating those factual contradictions as reflection tokens enables to enforcement of hard control and also verification of model outputs easily. In the third example, while the generation is mostly correct, SELF-RAG predicts Partially Support to the statement listing the name of the songs, as they were not explicitly mentioned.


## D FULL LIST OF INSTRUCTIONS AND DEMONSTRATIONS FOR GPT-4


Here, we show the instructions and demonstrations used to prompt GPT-4 to collect reflection tokens. Table 8 shows the instructions and demonstrations for the initial retrieval token. Table 9 shows the instruction and demonstrations used to collect the three-way output tokens for Retrieve given instruction, preceding sentences, and previously retrieved passages. Due to the longer demonstration and test input, we only use a single demonstration. Table 10 shows an instruction and demonstrations used to collect the three-way output tokens for ISREL . Table 11 shows an instruction and demonstrations used to collect the three-way output tokens for ISREL . Table 12 shows an instruction and demonstrations used to collect the five-way output tokens for ISUSE .
