-- CreateIndex
CREATE INDEX "TestCaseSet_projectId_idx" ON "TestCaseSet"("projectId");

-- CreateIndex
CREATE INDEX "TestCase_testCaseSetId_idx" ON "TestCase"("testCaseSetId");

-- CreateIndex
CREATE INDEX "AutomationScript_projectId_idx" ON "AutomationScript"("projectId");
