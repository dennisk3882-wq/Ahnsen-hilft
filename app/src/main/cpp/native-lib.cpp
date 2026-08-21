#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <string>
#include "node.h"

extern "C" JNIEXPORT jint JNICALL
Java_com_denko_eufymonitor_MainActivity_startNodeWithArguments(
        JNIEnv *env,
        jobject,
        jobjectArray arguments) {
    const jsize count = env->GetArrayLength(arguments);
    std::vector<std::string> strings;
    strings.reserve(count);
    size_t total = 0;

    for (jsize i = 0; i < count; ++i) {
        auto js = static_cast<jstring>(env->GetObjectArrayElement(arguments, i));
        const char *raw = env->GetStringUTFChars(js, nullptr);
        strings.emplace_back(raw ? raw : "");
        if (raw) env->ReleaseStringUTFChars(js, raw);
        env->DeleteLocalRef(js);
        total += strings.back().size() + 1;
    }

    char *buffer = static_cast<char*>(calloc(total, 1));
    if (!buffer) return -1;
    std::vector<char*> argv(count);
    char *cursor = buffer;
    for (jsize i = 0; i < count; ++i) {
        memcpy(cursor, strings[i].c_str(), strings[i].size());
        argv[i] = cursor;
        cursor += strings[i].size() + 1;
    }

    const int result = node::Start(static_cast<int>(count), argv.data());
    free(buffer);
    return result;
}
