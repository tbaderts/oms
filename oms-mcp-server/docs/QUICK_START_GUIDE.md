# Quick Start: Spec-Driven Development with Copilot

## 🚀 Get Started in 5 Minutes

### What You Have
✅ **MCP Knowledge Server** - Running and serving 9 OMS spec documents  
✅ **6 MCP Tools** - Available in GitHub Copilot via `@workspace`  
✅ **Full Specs** - Domain model, architecture, methodology, and more

---

## 📋 The 3-Step Pattern

### 1️⃣ Ask Copilot to Read Specs
```
@workspace Search specs for "[YOUR TOPIC]"
```
or
```
@workspace Read specs/[FILENAME].md section "[SECTION NAME]"
```

### 2️⃣ Generate or Analyze Code
```
@workspace Based on the spec, generate [CODE]
```
or
```
@workspace Compare [YOUR CODE] against the spec requirements
```

### 3️⃣ Validate and Iterate
```
@workspace Does this implementation match the spec? What's missing?
```

---

## 🎯 Your First 3 Tasks

### Task 1: Understand Your Domain (2 min)
```
@workspace Read the manifesto.md and summarize our team's core principles
```

Then:
```
@workspace List all sections in the OMS spec and explain what each covers
```

### Task 2: Generate Spec-Compliant Code (5 min)
```
@workspace I need to create the Execution entity class:
1. Search specs for "Execution" 
2. Read the domain model section
3. Generate Execution.java following the same pattern as Order
4. Include spec references in Javadoc
```

### Task 3: Validate Existing Code (3 min)
```
@workspace Analyze [pick any file in your codebase] against OMS specifications:
1. Identify which spec sections apply
2. Check if it follows spec requirements
3. List any deviations
4. Suggest improvements
```

---

## 💡 Common Prompts (Copy-Paste Ready)

### Understanding Specs
```
@workspace What does the OMS spec say about [CONCEPT]?
```

### Creating New Code
```
@workspace Using the spec, create [CLASS/METHOD] that follows all requirements
```

### Writing Tests
```
@workspace Generate tests for [CLASS] covering all spec requirements
```

### Code Review
```
@workspace Does [FILE] comply with OMS specifications? Report details.
```

### Refactoring
```
@workspace Refactor [CODE] to match the spec pattern for [CONCEPT]
```

---

## 🎓 Learn by Doing

### Week 1: Exploration
- Day 1: Read all spec summaries
- Day 2: Create one entity following specs
- Day 3: Write tests referencing specs
- Day 4: Validate one existing file
- Day 5: Refactor one class to match specs

### Week 2: Integration
- Use spec prompts for all new code
- Add spec references to all new classes
- Review PRs against specs
- Create spec compliance checklist

### Week 3: Mastery
- Teach teammates the pattern
- Build spec-driven templates
- Create project-specific prompts
- Measure spec compliance improvements

---

## 📚 Resources Created for You

1. **COPILOT_KNOWLEDGE_INTEGRATION_GUIDE.md** - Complete reference
2. **COPILOT_PROMPTS_LIBRARY.md** - 50+ ready-to-use prompts
3. **SPEC_DRIVEN_DEMO.md** - Real example walkthrough
4. **QUICK_REFERENCE.md** - MCP tools cheat sheet

---

## ⚡ Power Tips

### Tip 1: Chain Prompts
Don't ask one big question. Build up:
```
Step 1: @workspace Search specs for "validation"
Step 2: @workspace Based on what you found, explain the validation pattern
Step 3: @workspace Generate a validator using that pattern
```

### Tip 2: Be Specific
❌ "Create Order class"
✅ "@workspace Using specs/oms_spec.md § 5, create Order class with spec references"

### Tip 3: Always Validate
After generating code:
```
@workspace Check if this matches the spec requirements. What's missing?
```

### Tip 4: Use TODOs for Future Specs
```
@workspace Generate Order class with TODOs for any spec requirements we can't fully implement yet
```

### Tip 5: Map Tests to Specs
```
@workspace Each test should have a comment linking to its spec requirement
```

---

## 🎯 Success Metrics

Track these over 30 days:

- [ ] % of new code with spec references in comments: ____%
- [ ] % of tests mapped to spec requirements: ____%  
- [ ] Number of spec-driven refactorings: _____
- [ ] Spec compliance score (estimate): ____%
- [ ] Team members using spec prompts: _____

---

## 🔥 Quick Wins Today

Try these right now:

**1. Explore your knowledge base:**
```
@workspace What specs are available? List them with brief descriptions.
```

**2. Understand a core concept:**
```
@workspace Explain Event Sourcing as described in our OMS specs
```

**3. Generate something useful:**
```
@workspace Create an OrderState enum with all states from the spec, including Javadoc for each state explaining when it's used
```

**4. Validate something:**
```
@workspace Check if our build.gradle dependencies match the Technology Stack from oms_spec.md
```

---

## 🎊 You're Ready!

Your MCP knowledge server is running, specs are indexed, and Copilot can access them.

**Every time you code, start with:**
```
@workspace Search/read specs for [TOPIC]
```

**Then let Copilot help you write spec-compliant code!**

---

## 🆘 Troubleshooting

**Copilot not finding specs?**
- Check: `@workspace What MCP tools are available?`
- Should see: listDomainDocs, readDomainDoc, etc.
- If missing: Reload VS Code window

**Empty results from listDomainDocs?**
- The tool should return 9 documents
- If empty: Check application.yml has correct path
- Rebuild: `./gradlew bootJar`
- Reload VS Code

**Copilot not using specs automatically?**
- You must ask it explicitly with `@workspace`
- Reference specs in your prompts
- Use prompts from COPILOT_PROMPTS_LIBRARY.md

---

## 📞 Next Steps

1. ✅ Try the "Quick Wins Today" section above
2. ✅ Review COPILOT_PROMPTS_LIBRARY.md for more examples  
3. ✅ Share this with your team
4. ✅ Add spec references to your next PR
5. ✅ Celebrate spec-driven development! 🎉

---

**Remember:** Your specs are now **living documentation** that actively helps you code!

Happy spec-driven coding! 🚀
