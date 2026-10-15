import { ZodObject } from "zod";

export const schemaRunner = (schema: ZodObject, input: object) => {
  const result = schema.safeParse(input);
  if (result.success) {
    console.log(result.data);
  } else {
    console.log(result.error.issues);
  }
};
